import { execFile, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { devNull, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const CHART_DIR = path.resolve(import.meta.dirname, '../helm/chart/promptfoo');
const templateArgs = ['template', 'my-promptfoo', CHART_DIR];

// Nothing else in CI renders the chart. GitHub's Linux runners ship Helm, so the suite must
// run there. Elsewhere it is skipped when Helm is not installed.
const hasHelm = spawnSync('helm', ['version', '--short'], { encoding: 'utf8' }).status === 0;
const mustRender = process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux';

type PodSpec = Record<string, unknown> & { containers: Record<string, unknown>[] };
type Resource = {
  kind: string;
  metadata: { name: string; annotations?: Record<string, string> };
  spec: Record<string, unknown>;
};

function helm(...args: string[]) {
  return spawnSync('helm', args, { encoding: 'utf8' });
}

function render(...args: string[]): Resource[] {
  const result = helm(...templateArgs, ...args);
  expect(result.status, result.stderr).toBe(0);
  return parseResources(result.stdout);
}

function parseResources(manifest: string): Resource[] {
  return (yaml.loadAll(manifest) as (Resource | null)[]).filter(
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
      expect(pod).toHaveProperty(
        'affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms',
        [
          {
            matchExpressions: [
              { key: 'kubernetes.io/os', operator: 'In', values: ['linux'] },
              { key: 'kubernetes.io/arch', operator: 'In', values: ['amd64', 'arm64'] },
            ],
          },
        ],
      );
      expect(podSpec(render('--set', 'affinity.nodeAffinity=null'))).not.toHaveProperty(
        'affinity.nodeAffinity',
      );
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
        type: 'Recreate',
        rollingUpdate: null,
      });
      // No storage class: the cluster default applies.
      expect(only(resources, 'PersistentVolumeClaim').spec).toEqual({
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '1Gi' } },
      });
      // Uninstalling the release must not delete the data volume.
      expect(only(resources, 'PersistentVolumeClaim').metadata.annotations).toEqual({
        'helm.sh/resource-policy': 'keep',
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

      expect(podSpec(resources).containers[0].ports).toMatchObject([{ containerPort: 3000 }]);
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

    it('requires a migration decision for legacy domainName values during offline rendering', () => {
      const args = [...templateArgs, '--set', 'domainName=legacy.example.com'];
      expect(helm(...args).stderr).toContain('ingress.enabled=false');
      expect(helm(...args, '--set-string', 'ingress.enabled=false').stderr).toContain(
        'must be a boolean',
      );
      expect(helm(...args, '--set', 'ingress.enabled=false').status).toBe(0);
    });

    it('consults the existing Ingress and PVC during a server-side upgrade preview', async () => {
      // Helm 4 also discovers the resource kinds in the rendered chart.
      const groups = ['apps', 'networking.k8s.io'].map((name) => {
        const version = { groupVersion: `${name}/v1`, version: 'v1' };
        return { name, versions: [version], preferredVersion: version };
      });
      const resources = (groupVersion: string, ...kinds: string[]) => ({
        groupVersion,
        resources: kinds.map((kind) => ({
          kind,
          name: kind === 'Ingress' ? 'ingresses' : `${kind.toLowerCase()}s`,
          namespaced: true,
        })),
      });
      const ingressPath = '/apis/networking.k8s.io/v1/namespaces/default/ingresses/my-promptfoo';
      const claim = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: 'promptfoo',
          managedFields: [{ fieldsV1: { 'f:spec': { 'f:storageClassName': {} } } }],
        },
        spec: { storageClassName: 'legacy-class' },
      };
      const api: Record<string, unknown> = {
        '/version': { major: '1', minor: '34', gitVersion: 'v1.34.0' },
        '/api': { versions: ['v1'] },
        '/apis': { groups },
        '/api/v1': resources('v1', 'PersistentVolumeClaim', 'ServiceAccount', 'Service', 'Pod'),
        '/apis/apps/v1': resources('apps/v1', 'Deployment'),
        '/apis/networking.k8s.io/v1': resources('networking.k8s.io/v1', 'Ingress'),
        '/api/v1/namespaces/default/persistentvolumeclaims/promptfoo': claim,
        [ingressPath]: {
          apiVersion: 'networking.k8s.io/v1',
          kind: 'Ingress',
          metadata: {
            name: 'my-promptfoo',
            annotations: { 'meta.helm.sh/release-name': 'my-promptfoo' },
          },
        },
      };
      const server = createServer((req, res) => {
        const body = req.method === 'GET' && api[req.url!.split('?')[0]];
        res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body || {}));
      });
      const home = mkdtempSync(path.join(tmpdir(), 'helm-test-'));
      try {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const preview = async (...args: string[]) => {
          const { stdout } = await promisify(execFile)(
            'helm',
            [
              ...templateArgs,
              '--is-upgrade',
              '--dry-run=server',
              '--disable-openapi-validation',
              '--kube-apiserver',
              origin,
              '--kubeconfig',
              devNull,
              ...args,
            ],
            { env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home }, timeout: 10_000 },
          );
          return parseResources(stdout);
        };
        await expect(preview()).rejects.toThrow('ingress.enabled=false');
        const migrated = await preview('--set', 'ingress.enabled=false');
        expect(migrated.some((item) => item.kind === 'Ingress')).toBe(false);
        expect(only(migrated, 'PersistentVolumeClaim').spec.storageClassName).toBe('legacy-class');
        expect(only(migrated, 'Deployment').spec.strategy).toEqual({
          type: 'Recreate',
          rollingUpdate: null,
        });

        delete api[ingressPath];
        claim.metadata.managedFields = [];
        expect(only(await preview(), 'PersistentVolumeClaim').spec).not.toHaveProperty(
          'storageClassName',
        );
      } finally {
        server.close();
        server.closeAllConnections();
        rmSync(home, { force: true, recursive: true });
      }
    });

    it('sets a storage class only when one is given', () => {
      const claims = [
        {
          name: 'promptfoo',
          size: '10Gi',
          accessModes: ['ReadWriteOnce'],
          // A class named like a number must stay a string.
          storageClassName: '123',
        },
      ];
      const claim = only(
        render('--set-json', `persistentVolumesClaims=${JSON.stringify(claims)}`),
        'PersistentVolumeClaim',
      );

      expect(claim.spec).toEqual({
        accessModes: ['ReadWriteOnce'],
        storageClassName: '123',
        resources: { requests: { storage: '10Gi' } },
      });
    });

    it('renders no autoscaler when values still enable one', () => {
      const resources = render(
        '--set',
        'autoscaling.enabled=true',
        '--set',
        'autoscaling.targetCPUUtilizationPercentage=80',
      );

      // The server cannot run more than one replica.
      expect(resources.map((resource) => resource.kind)).not.toContain('HorizontalPodAutoscaler');
      expect(only(resources, 'Deployment').spec.replicas).toBe(1);
    });
  });
});
