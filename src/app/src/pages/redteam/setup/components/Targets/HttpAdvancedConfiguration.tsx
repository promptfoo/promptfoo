import 'prismjs/components/prism-http';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism.css';

import React from 'react';

import { Separator } from '@app/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import AuthorizationTab from './tabs/AuthorizationTab';
import HttpStatusCodeTab from './tabs/HttpStatusCodeTab';
import RequestTransformTab from './tabs/RequestTransformTab';
import SessionsTab from './tabs/SessionsTab';
import TlsHttpsConfigTab from './tabs/TlsHttpsConfigTab';
import TokenEstimationTab from './tabs/TokenEstimationTab';
import type { ProviderOptions } from '@promptfoo/types';

// Tab values for string-based Radix tabs
const TabValue = {
  SessionManagement: 'session',
  Authorization: 'auth',
  RequestTransform: 'transform',
  TokenEstimation: 'token',
  TlsHttpsConfig: 'tls',
  HttpStatusCode: 'status',
} as const;

interface HttpAdvancedConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  defaultRequestTransform?: string;
  onSessionTested?: (success: boolean) => void;
}

const HttpAdvancedConfiguration: React.FC<HttpAdvancedConfigurationProps> = ({
  selectedTarget,
  defaultRequestTransform,
  updateCustomTarget,
  onSessionTested,
}: HttpAdvancedConfigurationProps) => {
  return (
    <>
      {/* Advanced Configuration Section */}
      <div className="mt-8">
        <Tabs defaultValue={TabValue.SessionManagement}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value={TabValue.SessionManagement}>Session Management</TabsTrigger>
            <TabsTrigger value={TabValue.Authorization}>Authorization</TabsTrigger>
            <TabsTrigger value={TabValue.RequestTransform}>Request Transform</TabsTrigger>
            <TabsTrigger value={TabValue.TokenEstimation}>Token Estimation</TabsTrigger>
            <TabsTrigger value={TabValue.TlsHttpsConfig}>TLS/HTTPS Config</TabsTrigger>
            <TabsTrigger value={TabValue.HttpStatusCode}>HTTP Status Code</TabsTrigger>
          </TabsList>

          <TabsContent value={TabValue.SessionManagement} className="px-2 py-6">
            <SessionsTab
              selectedTarget={selectedTarget}
              updateCustomTarget={updateCustomTarget}
              onTestComplete={onSessionTested}
            />
          </TabsContent>

          <TabsContent value={TabValue.Authorization} className="px-2 py-6">
            <AuthorizationTab
              selectedTarget={selectedTarget}
              updateCustomTarget={updateCustomTarget}
            />
          </TabsContent>

          <TabsContent value={TabValue.RequestTransform} className="px-2 py-6">
            <RequestTransformTab
              selectedTarget={selectedTarget}
              updateCustomTarget={updateCustomTarget}
              defaultRequestTransform={defaultRequestTransform}
            />
          </TabsContent>

          <TabsContent value={TabValue.TokenEstimation} className="px-2 py-6">
            <TokenEstimationTab
              selectedTarget={selectedTarget}
              updateCustomTarget={updateCustomTarget}
            />
          </TabsContent>

          <TabsContent value={TabValue.TlsHttpsConfig} className="px-2 py-6">
            <TlsHttpsConfigTab
              selectedTarget={selectedTarget}
              updateCustomTarget={updateCustomTarget}
            />
          </TabsContent>

          <TabsContent value={TabValue.HttpStatusCode} className="px-2 py-6">
            <HttpStatusCodeTab
              selectedTarget={selectedTarget}
              updateCustomTarget={updateCustomTarget}
            />
          </TabsContent>
        </Tabs>
      </div>
      <Separator />
    </>
  );
};

export default HttpAdvancedConfiguration;
