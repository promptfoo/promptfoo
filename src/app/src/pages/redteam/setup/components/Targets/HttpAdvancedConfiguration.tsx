import '@app/lib/prism';
import 'prismjs/themes/prism.css';

import React, { useEffect, useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Separator } from '@app/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { cn } from '@app/lib/utils';
import { ChevronDown } from 'lucide-react';
import AuthorizationTab from './tabs/AuthorizationTab';
import HttpStatusCodeTab from './tabs/HttpStatusCodeTab';
import RequestTransformTab from './tabs/RequestTransformTab';
import SessionsTab from './tabs/SessionsTab';
import TlsHttpsConfigTab from './tabs/TlsHttpsConfigTab';
import TokenEstimationTab from './tabs/TokenEstimationTab';
import type { ProviderOptions } from '@promptfoo/types';

import type { AuthorizationFieldErrors } from './tabs/AuthorizationTab';

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
  authorizationFieldErrors?: AuthorizationFieldErrors;
}

const ADVANCED_CONFIG_FIELDS = [
  'auth',
  'signatureAuth',
  'stateful',
  'sessionSource',
  'sessionParser',
  'session',
  'transformRequest',
  'tokenEstimation',
  'tls',
  'validateStatus',
] as const;

const hasAdvancedConfiguration = (target: ProviderOptions): boolean =>
  ADVANCED_CONFIG_FIELDS.some((field) => target.config?.[field] !== undefined);

const HttpAdvancedConfiguration: React.FC<HttpAdvancedConfigurationProps> = ({
  selectedTarget,
  defaultRequestTransform,
  updateCustomTarget,
  onSessionTested,
  authorizationFieldErrors = {},
}: HttpAdvancedConfigurationProps) => {
  const [isExpanded, setIsExpanded] = useState(() => hasAdvancedConfiguration(selectedTarget));
  const [selectedTab, setSelectedTab] = useState<string>(TabValue.SessionManagement);
  const hasAuthorizationErrors = Object.keys(authorizationFieldErrors).length > 0;
  const handleExpandedChange = (open: boolean) => {
    if (!open && hasAuthorizationErrors) {
      return;
    }
    setIsExpanded(open);
  };

  useEffect(() => {
    if (hasAuthorizationErrors) {
      setIsExpanded(true);
      setSelectedTab(TabValue.Authorization);
    }
  }, [hasAuthorizationErrors]);

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={handleExpandedChange} className="mt-8">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50">
          <div>
            <h3 className="font-semibold">Advanced HTTP settings</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Authentication, sessions, transforms, TLS, token estimation, and status rules.
            </p>
          </div>
          <ChevronDown
            className={cn(
              'size-5 shrink-0 text-muted-foreground transition-transform',
              isExpanded && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid !h-auto w-full grid-cols-2 gap-1 overflow-visible md:grid-cols-3 xl:inline-flex xl:!h-10 xl:w-auto xl:gap-0">
              <TabsTrigger value={TabValue.SessionManagement}>Session Management</TabsTrigger>
              <TabsTrigger value={TabValue.Authorization}>Authorization</TabsTrigger>
              <TabsTrigger value={TabValue.RequestTransform}>Request Transform</TabsTrigger>
              <TabsTrigger value={TabValue.TokenEstimation}>Token Estimation</TabsTrigger>
              <TabsTrigger value={TabValue.TlsHttpsConfig}>TLS/HTTPS Config</TabsTrigger>
              <TabsTrigger value={TabValue.HttpStatusCode}>HTTP Status Code</TabsTrigger>
            </TabsList>

            <div className="mt-2 rounded-lg border border-border bg-card p-4">
              <TabsContent value={TabValue.SessionManagement} className="mt-0">
                <SessionsTab
                  selectedTarget={selectedTarget}
                  updateCustomTarget={updateCustomTarget}
                  onTestComplete={onSessionTested}
                />
              </TabsContent>

              <TabsContent value={TabValue.Authorization} className="mt-0">
                <AuthorizationTab
                  selectedTarget={selectedTarget}
                  updateCustomTarget={updateCustomTarget}
                  fieldErrors={authorizationFieldErrors}
                />
              </TabsContent>

              <TabsContent value={TabValue.RequestTransform} className="mt-0">
                <RequestTransformTab
                  selectedTarget={selectedTarget}
                  updateCustomTarget={updateCustomTarget}
                  defaultRequestTransform={defaultRequestTransform}
                />
              </TabsContent>

              <TabsContent value={TabValue.TokenEstimation} className="mt-0">
                <TokenEstimationTab
                  selectedTarget={selectedTarget}
                  updateCustomTarget={updateCustomTarget}
                />
              </TabsContent>

              <TabsContent value={TabValue.TlsHttpsConfig} className="mt-0">
                <TlsHttpsConfigTab
                  selectedTarget={selectedTarget}
                  updateCustomTarget={updateCustomTarget}
                />
              </TabsContent>

              <TabsContent value={TabValue.HttpStatusCode} className="mt-0">
                <HttpStatusCodeTab
                  selectedTarget={selectedTarget}
                  updateCustomTarget={updateCustomTarget}
                />
              </TabsContent>
            </div>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>
      <Separator />
    </>
  );
};

export default HttpAdvancedConfiguration;
