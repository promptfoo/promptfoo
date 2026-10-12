import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const CHART_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'helm',
  'chart',
  'promptfoo',
);

// Nothing else in CI renders the chart. GitHub's Linux runners ship Helm, so the suite must
// run there. Elsewhere it is skipped when Helm is not installed.
const hasHelm = spawnSync('helm', ['version', '--short'], { encoding: 'utf8' }).status === 0;
const mustRender = process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux';

type EnvEntry = { name: string; value?: string; valueFrom?: unknown };
type Container = {
  image: string;
  imagePullPolicy: string;
  ports: { name: string; containerPort: number; protocol: string }[];
  livenessProbe: { httpGet: { path: string; port: string } };
  readinessProbe: { httpGet: { path: string; port: string } };
  resources: Record<string, unknown>;
  securityContext: Record<string, unknown>;
  env: EnvEntry[];
  envFrom?: unknown[];
};
type PodSpec = {
  containers: Container[];
  securityContext: Record<string, unknown>;
  nodeSelector?: Record<string, string>;
  imagePullSecrets?: unknown[];
};
type Resource = {
  kind: string;
  metadata: { name: string; annotations?: Record<string, string> };
  spec: Record<string, unknown>;
};

function helm(...args: string[]) {
  return spawnSync('helm', args, { encoding: 'utf8' });
}

function render(...args: string[]): Resource[] {
  const result = helm('template', 'my-promptfoo', CHART_DIR, ...args);
  expect(result.status, result.stderr).toBe(0);
  return (yaml.loadAll(result.stdout) as (Resource | null)[]).filter(
    (resource): resource is Resource => resource !== null,
  );
}

function only(resources: Resource[], kind: string): Resource {
  const matches = resources.filter((resource) => resource.kind === kind);
  expect(matches, `expected one ${kind}`).toHaveLength(1);
  return matches[0];
}

function podSpec(resources: Resource[]): PodSpec {
  const template = only(resources, 'Deployment').spec.template as { spec: PodSpec };
  return template.spec;
}

describe('Helm chart', () => {
  it('has Helm available wherever CI is expected to render it', () => {
    expect(hasHelm || !mustRender, 'Helm is missing on a Linux CI runner').toBe(true);
  });

  describe.skipIf(!hasHelm)('rendered with helm template', () => {
    it('passes strict lint', () => {
      const result = helm('lint', '--strict', CHART_DIR);

      expect(result.status, result.stdout + result.stderr).toBe(0);
    });

    it('renders a server that can start with default values', () => {
      const resources = render();
      const pod = podSpec(resources);
      const [server] = pod.containers;

      // No Ingress unless it is asked for.
      expect(resources.map((resource) => resource.kind).sort()).toEqual([
        'Deployment',
        'PersistentVolumeClaim',
        'Pod',
        'Service',
        'ServiceAccount',
      ]);
      // Image tags have no `v` prefix, and the image is public.
      expect(server.image).toBe('ghcr.io/promptfoo/promptfoo:latest');
      expect(server.imagePullPolicy).toBe('Always');
      expect(pod.imagePullSecrets).toBeUndefined();
      // The image is published for amd64 and arm64.
      expect(pod.nodeSelector).toBeUndefined();
      // The server idles near 256Mi, so a default limit below that is an immediate OOM kill.
      expect(server.resources).toEqual({});
      expect(server.ports).toEqual([{ name: 'http', containerPort: 3000, protocol: 'TCP' }]);
      expect(server.livenessProbe.httpGet).toEqual({ path: '/health', port: 'http' });
      expect(server.readinessProbe.httpGet).toEqual({ path: '/health', port: 'http' });
      // The image runs as 100:101 and must be able to write to the data volume.
      expect(server.securityContext).toMatchObject({
        runAsNonRoot: true,
        runAsUser: 100,
        runAsGroup: 101,
        allowPrivilegeEscalation: false,
      });
      expect(pod.securityContext).toEqual({ fsGroup: 101 });
      expect(server.env).toEqual([
        { name: 'PROMPTFOO_REMOTE_API_BASE_URL', value: 'http://localhost:3000' },
        { name: 'PROMPTFOO_REMOTE_APP_BASE_URL', value: 'http://localhost:3000' },
      ]);
      // The old pod has to release the ReadWriteOnce volume before the new one starts.
      expect(only(resources, 'Deployment').spec.strategy).toEqual({
        type: 'RollingUpdate',
        rollingUpdate: { maxSurge: 0, maxUnavailable: 1 },
      });
      // No storage class: the cluster default applies.
      expect(only(resources, 'PersistentVolumeClaim').spec).toEqual({
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '1Gi' } },
      });
    });

    it('pulls a pinned tag only when it is missing', () => {
      const [server] = podSpec(render('--set', 'image.tag=0.124.1')).containers;

      expect(server.image).toBe('ghcr.io/promptfoo/promptfoo:0.124.1');
      expect(server.imagePullPolicy).toBe('IfNotPresent');
    });

    it('keeps the container port when the service port changes', () => {
      const resources = render('--set', 'service.port=80');
      const servicePorts = only(resources, 'Service').spec.ports as Record<string, unknown>[];

      expect(podSpec(resources).containers[0].ports[0].containerPort).toBe(3000);
      expect(servicePorts[0]).toMatchObject({ port: 80, targetPort: 'http' });
    });

    it('lets env entries replace a default URL without repeating its name', () => {
      const env = [
        { name: 'PROMPTFOO_REMOTE_APP_BASE_URL', value: 'https://promptfoo.example.com' },
        { name: 'OPENAI_API_KEY', valueFrom: { secretKeyRef: { name: 'keys', key: 'openai' } } },
      ];
      const [server] = podSpec(
        render(
          '--set-json',
          `env=${JSON.stringify(env)}`,
          '--set-json',
          'envFrom=[{"secretRef":{"name":"keys"}}]',
        ),
      ).containers;

      // A repeated name is rejected by server-side apply.
      expect(server.env).toEqual([
        { name: 'PROMPTFOO_REMOTE_API_BASE_URL', value: 'http://localhost:3000' },
        ...env,
      ]);
      expect(server.envFrom).toEqual([{ secretRef: { name: 'keys' } }]);
    });

    it('renders the configured ingress when it is enabled', () => {
      const ingress = only(
        render(
          '--set',
          'ingress.enabled=true',
          // A class named like a number must stay a string.
          '--set-string',
          'ingress.className=123',
          '--set-json',
          'ingress.annotations={"cert-manager.io/cluster-issuer":"letsencrypt"}',
          '--set-json',
          'ingress.hosts=[{"host":"pf.example.com","paths":[{"path":"/","pathType":"Prefix"}]}]',
          '--set-json',
          'ingress.tls=[{"secretName":"pf-tls","hosts":["pf.example.com"]}]',
        ),
        'Ingress',
      );

      expect(ingress.metadata.annotations).toEqual({
        'cert-manager.io/cluster-issuer': 'letsencrypt',
      });
      expect(ingress.spec).toEqual({
        ingressClassName: '123',
        rules: [
          {
            host: 'pf.example.com',
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: { service: { name: 'my-promptfoo', port: { number: 3000 } } },
                },
              ],
            },
          },
        ],
        tls: [{ secretName: 'pf-tls', hosts: ['pf.example.com'] }],
      });
    });

    it('sets a storage class only when one is given', () => {
      const claims = [
        {
          name: 'promptfoo',
          size: '10Gi',
          accessModes: ['ReadWriteOnce'],
          storageClassName: 'fast',
        },
      ];
      const claim = only(
        render('--set-json', `persistentVolumesClaims=${JSON.stringify(claims)}`),
        'PersistentVolumeClaim',
      );

      expect(claim.spec).toEqual({
        accessModes: ['ReadWriteOnce'],
        storageClassName: 'fast',
        resources: { requests: { storage: '10Gi' } },
      });
    });
  });
});
