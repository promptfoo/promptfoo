import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ErrorFallback from '@cloud-ui/components/ErrorFallback';
import { getProviderType } from '@cloud-ui/components/providers/helpers';
import ProviderConfigEditor from '@cloud-ui/components/providers/ProviderConfigEditor';
import ProviderTypeSelector from '@cloud-ui/components/providers/ProviderTypeSelector';
import { ROUTES } from '@cloud-ui/constants';
import { useCan } from '@cloud-ui/contexts/RbacContext';
import { useNavigateOnTeamChange } from '@cloud-ui/contexts/TeamsContext';
import { useMutateProvider, useProvider } from '@cloud-ui/hooks/useProvider';
import { KeyboardArrowLeft as KeyboardArrowLeftIcon } from '@mui/icons-material';
import DescriptionIcon from '@mui/icons-material/Description';
import TargetIcon from '@mui/icons-material/GpsFixed';
import InfoIcon from '@mui/icons-material/Info';
import ReviewIcon from '@mui/icons-material/RateReview';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  Alert as MuiAlert,
  Radio,
  RadioGroup,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { Actions, Subjects } from '@shared/dto/rbac';
import { useQueryClient } from '@tanstack/react-query';
import { cloneDeep, isEqual } from 'lodash';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import DisplayTargetConfig from '../components/plugins/DisplayTargetConfig';
import { makeProviderPurposeDiscoveryQueryKey } from '../hooks/providers';
import ApplicationDescriptionForm from './components/ApplicationDescription';
import ReviewPanel from './components/ReviewPanel';
import type { ProviderConfigEditorRef } from '@cloud-ui/components/providers/ProviderConfigEditor';
import type { ProviderOptions } from '@promptfoo/types';
import type { UpdateProviderRequest } from '@shared/dto/providers';

const DEFAULT_PROVIDER_CONFIG: UpdateProviderRequest = {
  stateful: true,
};

const StyledTabs = styled(Tabs)(({ theme }) => ({
  '& .MuiTabs-indicator': {
    left: 0,
    right: 'auto',
  },
  width: '100%',
  backgroundColor: theme.palette.background.paper,
  '& .MuiTab-root': {
    minHeight: '48px',
  },
  '& .MuiTabs-scrollButtons': {
    display: 'none',
  },
}));

const StyledTab = styled(Tab)(({ theme }) => ({
  alignItems: 'center',
  textAlign: 'left',
  justifyContent: 'flex-start',
  '&.Mui-selected': {
    backgroundColor: theme.palette.action.selected,
    borderLeft: `3px solid ${theme.palette.primary.main}`,
  },
  maxWidth: 'none',
  width: '100%',
  minHeight: '48px',
  padding: theme.spacing(1, 2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  '& .MuiSvgIcon-root': {
    marginRight: theme.spacing(1),
    fontSize: '18px',
  },
  textTransform: 'none',
  fontSize: '0.875rem',
}));

const Root = styled(Box)(({ theme }) => ({
  position: 'fixed',
  top: 64,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
  overflow: 'hidden',
}));

const PageHeader = styled(Box)(({ theme }) => ({
  borderTop: `1px solid ${theme.palette.divider}`,
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  '.headerContent': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 2),
    minHeight: 56,
  },
  '.leftSection': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  '.backButton': {
    marginRight: theme.spacing(0.5),
  },
}));

const MainContent = styled(Box)({
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
});

const OuterSidebarContainer = styled(Box)(({ theme }) => ({
  width: '280px',
  borderRight: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  display: 'flex',
  flexDirection: 'column',
}));

const InnerSidebarContainer = styled(Box)({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

const Content = styled(Box)({
  flex: 1,
  overflow: 'auto',
  padding: '24px',
});

const TabContent = styled(Box)({
  height: '100%',
});

const TabsContainer = styled(Box)({
  flex: 1,
  overflow: 'auto',
});

const Alert = styled(MuiAlert)(({ theme }) => ({
  margin: theme.spacing(2),
  backgroundColor: '#FFF1F1',
  border: 'none',
  '& .MuiAlert-icon': {
    color: theme.palette.error.main,
  },
  '& ul': {
    margin: '8px 0 0 0',
    paddingLeft: '1.25rem',
    listStyleType: 'none',
  },
  '& li': {
    marginBottom: '4px',
    '&::before': {
      content: '"•"',
      color: theme.palette.error.main,
      display: 'inline-block',
      width: '1em',
      marginLeft: '-1em',
    },
  },
}));

export enum TabIndex {
  TargetSelection = 0,
  Configuration = 1,
  ApplicationDetails = 2,
  Context = 3,
  Review = 4,
}

function TabPanel(props: { children?: React.ReactNode; index: number; value: number }) {
  const { children, value, index, ...other } = props;

  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      sx={{ height: '100%' }}
      {...other}
    >
      {value === index && <Box sx={{ height: '100%' }}>{children}</Box>}
    </Box>
  );
}

export default function EditTargetPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = id === 'new';
  const [configError, setConfigError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [configTabHasError, setConfigTabHasError] = useState<boolean>(isNew);
  const [descriptionTabHasError, setDescriptionTabHasError] = useState<boolean>(isNew);
  const [hasVisitedDescriptionTab, setHasVisitedDescriptionTab] = useState<boolean>(!isNew);
  const [hasVisitedApplicationDetailsTab, setHasVisitedApplicationDetailsTab] = useState<boolean>(
    !isNew,
  );
  const [validateAllFields, setValidateAllFields] = useState<boolean>(false);
  const queryClient = useQueryClient();

  // Define available tabs based on provider type
  const tabs = useMemo<TabIndex[]>(() => {
    // Initial tabs setup
    return [
      TabIndex.TargetSelection,
      TabIndex.Configuration,
      TabIndex.ApplicationDetails,
      TabIndex.Context,
      TabIndex.Review,
    ];
  }, []);

  // References for validation
  const configEditorRef = useRef<ProviderConfigEditorRef>(null);

  // State for updates and target
  const [updates, setUpdates] = useState<UpdateProviderRequest | undefined>(
    isNew ? DEFAULT_PROVIDER_CONFIG : undefined,
  );

  const {
    data: target,
    isLoading,
    error: fetchProviderError,
    refetch: refetchTarget,
  } = useProvider(id, !isNew);

  const currentConfig = useMemo(() => {
    if (!updates?.type || updates.type === target?.type) {
      return { ...cloneDeep(target?.config), ...cloneDeep(updates?.config) };
    }
    return updates?.config ?? {};
  }, [updates, target]);

  const canEdit = useCan(Actions.UPDATE, Subjects.PROVIDER);

  const [activeTab, setActiveTab] = useState<TabIndex>(() => {
    const hash = location.hash.replace('#', '');
    if (!isNew && !hash) {
      return TabIndex.Review;
    }
    const parsedIndex = hash ? Number.parseInt(hash, 10) : 0;
    // Map numeric index to TabIndex enum
    switch (parsedIndex) {
      case 0:
        return TabIndex.TargetSelection;
      case 1:
        return TabIndex.Configuration;
      case 2:
        return TabIndex.ApplicationDetails;
      case 3:
        return TabIndex.Context;
      case 4:
        return TabIndex.Review;
      default:
        return TabIndex.TargetSelection;
    }
  });

  useNavigateOnTeamChange(isNew, ROUTES.redteam.targets);

  const providerType = updates?.type ?? target?.type ?? getProviderType(currentConfig?.id);

  const handleUpdate = (key: keyof UpdateProviderRequest, value: any) => {
    setUpdates((updates) => {
      const newUpdates = { ...(updates ?? {}) };
      newUpdates[key] = value;

      // Check if value and value.config exist before using 'in' operator
      if (
        key === 'config' &&
        value &&
        value.config &&
        typeof value.config === 'object' &&
        'sessionSource' in value.config
      ) {
        newUpdates.sessionSource = value.config.sessionSource;
      }
      return newUpdates;
    });
  };

  const saveMutation = useMutateProvider(id, isNew, async (savedProvider) => {
    setUpdates(undefined);

    if (!isNew) {
      refetchTarget();
    }
    if (isNew) {
      navigate(`${ROUTES.redteam.targets}/${savedProvider.id}#${activeTab}`);
    }

    // Reset the purpose discovery query: this allows the user to re-run discover e.g. if it errored because
    // of a provider misconfiguration.
    await queryClient.resetQueries({
      queryKey: makeProviderPurposeDiscoveryQueryKey(savedProvider.id),
      exact: true,
    });
  });

  const isDirty = useMemo(() => {
    return (
      (updates?.name && updates?.name !== target?.name) ||
      (updates?.config && !isEqual(updates?.config, target?.config)) ||
      (updates?.applicationDescription &&
        !isEqual(updates?.applicationDescription, target?.applicationDescription)) ||
      (updates?.stateful !== undefined && updates?.stateful !== target?.stateful) ||
      (updates?.type !== undefined && updates?.type !== target?.type) ||
      (updates?.extensions !== undefined && !isEqual(updates?.extensions, target?.extensions))
    );
  }, [updates, currentConfig, target]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (updates) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [updates]);

  useEffect(() => {
    if (location.hash !== `#${activeTab}`) {
      setActiveTab(Number(location.hash.replace('#', '')));
    }
  }, [location.hash]);

  const updateHash = (newValue: TabIndex) => {
    if (location.hash !== `#${newValue}`) {
      navigate(`#${newValue}`);
    }
  };

  // Convert logical tab index to actual tab index
  const getActualTabIndex = (logicalIndex: TabIndex): number => {
    return tabs.findIndex((tab) => tab === logicalIndex);
  };

  // Find next tab based on current tab and available tabs
  const getNextTab = (currentTab: TabIndex): TabIndex => {
    return tabs[currentTab + 1];
  };

  // Find previous tab based on current tab and available tabs
  const getPreviousTab = (currentTab: TabIndex): TabIndex => {
    const currentTabIndex = tabs.findIndex((tab) => tab === currentTab);
    if (currentTabIndex > 0) {
      return tabs[currentTabIndex - 1];
    }
    return currentTab;
  };

  const handleNext = () => {
    const currentTab = tabs.includes(activeTab) ? activeTab : TabIndex.TargetSelection;

    const nextTab = getNextTab(currentTab);
    updateHash(nextTab);
    setActiveTab(nextTab);
  };

  const handleBack = () => {
    const currentTab = tabs.includes(activeTab) ? activeTab : TabIndex.Review;

    const prevTab = getPreviousTab(currentTab);
    updateHash(prevTab);
    setActiveTab(prevTab);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    // Find the actual tab from the tab array
    // newValue is the index in the visible tabs array
    const selectedTab = tabs[newValue];

    if (selectedTab === TabIndex.Context) {
      setHasVisitedDescriptionTab(true);
    }

    if (selectedTab === TabIndex.ApplicationDetails) {
      setHasVisitedApplicationDetailsTab(true);
    }

    updateHash(selectedTab);
    setActiveTab(selectedTab);
  };

  const handleConfigSetError = useCallback((errorMessage: string | null) => {
    setConfigError(errorMessage);
    setConfigTabHasError(!!errorMessage);
  }, []);

  const handleDescriptionSetError = (errorMessage: string | null) => {
    setDescriptionError(errorMessage);
    setDescriptionTabHasError(!!errorMessage);
  };

  // Handle provider selection/update from the ProviderTypeSelector
  const handleProviderSelect = (providerOptions: ProviderOptions) => {
    // Update the provider config
    setUpdates((oldUpdates) => {
      return {
        ...oldUpdates,
        name: oldUpdates?.name ?? '',
      };
    });
    handleUpdate('type', getProviderType(providerOptions.id));
    handleUpdate('config', providerOptions);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (fetchProviderError) {
    return <ErrorFallback error={new Error(`Failed to fetch target: ${fetchProviderError}`)} />;
  }

  const canSave = Boolean(
    !saveMutation.isPending &&
      isDirty &&
      (currentConfig.name || updates?.name?.trim() || target?.name?.trim()),
  );

  const handleSave = () => {
    setValidateAllFields(true);
    saveMutation.mutate(updates ?? {});
  };

  const canProceedToNext = (currentTab: number): boolean => {
    if (currentTab === TabIndex.TargetSelection) {
      const hasName = Boolean(updates?.name && updates.name.length > 0) || Boolean(target?.name);
      // Check for either an existing selection in updates or target
      const hasTargetSelection = Boolean(providerType);

      return hasName && hasTargetSelection;
    }
    if (currentTab === TabIndex.Configuration) {
      return !configTabHasError && !configError;
    }
    if (currentTab === TabIndex.ApplicationDetails) {
      return !descriptionTabHasError && !descriptionError;
    }
    if (currentTab === TabIndex.Context) {
      return !descriptionTabHasError && !descriptionError;
    }
    return true;
  };

  // Function to get tab index based on actual visible tabs in the UI
  const getTabId = (tabIndex: TabIndex): number => {
    return tabs.findIndex((tab) => tab === tabIndex);
  };

  return (
    <Root>
      <PageHeader>
        <div className="headerContent">
          <div className="leftSection">
            <IconButton
              className="backButton"
              onClick={() => navigate(ROUTES.redteam.targets)}
              aria-label="back to targets list"
            >
              <KeyboardArrowLeftIcon />
            </IconButton>
            <Typography variant="h6">{updates?.name || target?.name || 'New Target'}</Typography>
            {isDirty && canEdit && (
              <Typography
                variant="body2"
                color="warning.main"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <span>●</span> Unsaved changes
              </Typography>
            )}
          </div>
          <div className="rightSection">
            {canEdit && (
              <Button variant="contained" onClick={handleSave} disabled={!canSave}>
                {saveMutation.isPending ? 'Saving...' : 'Save Target'}
              </Button>
            )}
          </div>
        </div>
      </PageHeader>

      <MainContent>
        <OuterSidebarContainer>
          <InnerSidebarContainer>
            <TabsContainer>
              <StyledTabs
                orientation="vertical"
                variant="scrollable"
                value={getActualTabIndex(activeTab)}
                onChange={handleTabChange}
              >
                <StyledTab
                  icon={<TargetIcon />}
                  iconPosition="start"
                  label="Target Selection"
                  id={`tab-${getTabId(TabIndex.TargetSelection)}`}
                  aria-controls={`tabpanel-${getTabId(TabIndex.TargetSelection)}`}
                />
                <StyledTab
                  icon={<SettingsIcon />}
                  iconPosition="start"
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      Configuration
                      {configTabHasError && (
                        <Box
                          component="span"
                          sx={{
                            ml: 1,
                            color: 'warning.main',
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: '1rem',
                          }}
                        >
                          ⚠️
                        </Box>
                      )}
                    </Box>
                  }
                  id={`tab-${getTabId(TabIndex.Configuration)}`}
                  aria-controls={`tabpanel-${getTabId(TabIndex.Configuration)}`}
                />
                {tabs.includes(TabIndex.ApplicationDetails) && (
                  <StyledTab
                    icon={<InfoIcon />}
                    iconPosition="start"
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Application Details
                        {!hasVisitedApplicationDetailsTab && (
                          <Box
                            component="span"
                            sx={{
                              ml: 1,
                              color: 'primary.main',
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: '0.75rem',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: 'primary.main',
                            }}
                          />
                        )}
                        {hasVisitedApplicationDetailsTab && descriptionTabHasError && (
                          <Box
                            component="span"
                            sx={{
                              ml: 1,
                              color: 'warning.main',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            ⚠️
                          </Box>
                        )}
                      </Box>
                    }
                    id={`tab-${getTabId(TabIndex.ApplicationDetails)}`}
                    aria-controls={`tabpanel-${getTabId(TabIndex.ApplicationDetails)}`}
                  />
                )}
                {tabs.includes(TabIndex.Context) && (
                  <StyledTab
                    icon={<DescriptionIcon />}
                    iconPosition="start"
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Context
                        {!hasVisitedDescriptionTab && (
                          <Box
                            component="span"
                            sx={{
                              ml: 1,
                              color: 'primary.main',
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: '0.75rem',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: 'primary.main',
                            }}
                          />
                        )}
                        {hasVisitedDescriptionTab && descriptionTabHasError && (
                          <Box
                            component="span"
                            sx={{
                              ml: 1,
                              color: 'warning.main',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            ⚠️
                          </Box>
                        )}
                      </Box>
                    }
                    id={`tab-${getTabId(TabIndex.Context)}`}
                    aria-controls={`tabpanel-${getTabId(TabIndex.Context)}`}
                  />
                )}
                <StyledTab
                  icon={<ReviewIcon />}
                  iconPosition="start"
                  label="Review"
                  id={`tab-${getTabId(TabIndex.Review)}`}
                  aria-controls={`tabpanel-${getTabId(TabIndex.Review)}`}
                />
              </StyledTabs>
            </TabsContainer>
          </InnerSidebarContainer>
        </OuterSidebarContainer>

        <Content>
          <TabContent>
            <TabPanel value={activeTab} index={TabIndex.TargetSelection}>
              <Box
                sx={{
                  maxWidth: 'max(85%, 1200px)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <TextField
                  sx={{ mb: 3, width: '375px' }}
                  label="Target Name"
                  value={updates?.name ?? target?.name ?? ''}
                  placeholder="e.g. customer-service-agent"
                  onChange={(e) => handleUpdate('name', e.target.value)}
                  margin="normal"
                  required
                  autoFocus
                  InputLabelProps={{
                    shrink: true,
                  }}
                  error={Boolean(updates?.name === '')}
                  helperText={updates?.name === '' && 'This field is required'}
                  disabled={!canEdit}
                />

                <ProviderTypeSelector
                  provider={currentConfig}
                  setProvider={handleProviderSelect}
                  disableModelSelection={false}
                  providerType={providerType}
                />
              </Box>

              <Box
                sx={{
                  maxWidth: 'max(85%, 1200px)',
                  my: 4,

                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  {!((updates?.name && updates.name.length > 0) || Boolean(target?.name)) && (
                    <Typography variant="caption" color="error" sx={{ mr: 2 }}>
                      Target name is required
                    </Typography>
                  )}
                  {!providerType && (
                    <Typography variant="caption" color="error">
                      Target type selection is required
                    </Typography>
                  )}
                </Box>
                <Button
                  variant="contained"
                  onClick={handleNext}
                  disabled={!canProceedToNext(TabIndex.TargetSelection)}
                >
                  Next
                </Button>
              </Box>
            </TabPanel>

            <TabPanel value={activeTab} index={TabIndex.Configuration}>
              <Box
                sx={{
                  display: 'flex',
                  maxWidth: 'max(85%, 1200px)',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {configTabHasError && configError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {configError}
                  </Alert>
                )}
                {canEdit ? (
                  <ProviderConfigEditor
                    ref={configEditorRef}
                    providerType={providerType}
                    provider={currentConfig}
                    setProvider={(value) => handleUpdate('config', value)}
                    extensions={updates?.extensions ?? target?.extensions ?? []}
                    onExtensionsChange={(value) => handleUpdate('extensions', value)}
                    opts={{
                      hideErrors: false,
                      disableModelSelection: false,
                    }}
                    setError={handleConfigSetError}
                    validateAll={validateAllFields}
                    onValidate={(isValid) => {
                      // We can use this to track validation state
                      setConfigTabHasError(!isValid);
                    }}
                  />
                ) : (
                  <DisplayTargetConfig config={target?.config} />
                )}
                <Box sx={{ pb: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <Button variant="outlined" onClick={handleBack}>
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    disabled={!canProceedToNext(TabIndex.Configuration)}
                  >
                    Next
                  </Button>
                </Box>
              </Box>
            </TabPanel>

            {tabs.includes(TabIndex.ApplicationDetails) && (
              <TabPanel value={activeTab} index={TabIndex.ApplicationDetails}>
                <Box
                  sx={{ maxWidth: 'max(85%, 1200px)', display: 'flex', flexDirection: 'column' }}
                >
                  <Typography variant="h6" sx={{ mb: 3, fontWeight: 'medium' }}>
                    Application Details
                  </Typography>
                  <ApplicationDescriptionForm
                    data={updates?.applicationDescription ?? target?.applicationDescription ?? {}}
                    onUpdate={(value) => handleUpdate('applicationDescription', value)}
                    setError={handleDescriptionSetError}
                    canEdit={canEdit}
                    currentConfig={currentConfig}
                    providerId={target?.id ?? null}
                  />
                </Box>
                <Box
                  sx={{
                    my: 4,
                    pb: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    maxWidth: 'max(85%, 1200px)',
                  }}
                >
                  <Button variant="outlined" onClick={handleBack}>
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    disabled={!canProceedToNext(TabIndex.ApplicationDetails)}
                  >
                    Next
                  </Button>
                </Box>
              </TabPanel>
            )}

            {tabs.includes(TabIndex.Context) && (
              <TabPanel value={activeTab} index={TabIndex.Context}>
                <Box
                  sx={{ maxWidth: 'max(85%, 1200px)', display: 'flex', flexDirection: 'column' }}
                >
                  <Typography variant="h6" sx={{ mb: 3, fontWeight: 'medium' }}>
                    Application Context
                  </Typography>
                  <FormControl sx={{ mb: 4 }} component="fieldset">
                    <Typography variant="subtitle1" sx={{ mb: 2 }}>
                      Conversation History
                    </Typography>
                    <RadioGroup
                      value={String(
                        updates && 'stateful' in updates
                          ? updates.stateful
                          : (target?.stateful ?? false),
                      )}
                      onChange={(e) => handleUpdate('stateful', e.target.value === 'true')}
                    >
                      <FormControlLabel
                        value="true"
                        control={<Radio />}
                        label="System maintains conversation history"
                        disabled={!canEdit}
                      />
                      <FormControlLabel
                        value="false"
                        control={<Radio />}
                        label="The whole conversation gets sent on every request or there is no conversation history"
                        disabled={!canEdit}
                      />
                    </RadioGroup>
                  </FormControl>
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                      Who is the red team user?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Define the persona attempting to attack your system. This helps create
                      realistic attack scenarios for social engineering attacks targeting PII,
                      hijacking attempts, prompt extraction, system prompt override, and role-based
                      security vulnerabilities.
                    </Typography>
                    <TextField
                      fullWidth
                      value={
                        updates?.applicationDescription?.redteamUser ??
                        target?.applicationDescription?.redteamUser ??
                        ''
                      }
                      onChange={(e) =>
                        handleUpdate('applicationDescription', {
                          ...(updates?.applicationDescription ??
                            target?.applicationDescription ??
                            {}),
                          redteamUser: e.target.value,
                        })
                      }
                      placeholder="e.g. A patient seeking medical assistance, a customer service representative, an external researcher..."
                      disabled={!canEdit}
                      multiline
                      minRows={2}
                      variant="outlined"
                      sx={{
                        '& .MuiInputBase-inputMultiline': {
                          resize: 'vertical',
                          minHeight: '56px',
                        },
                      }}
                    />
                  </Box>
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                      Test Generation Instructions
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Provide specific instructions for how tests should be generated for this
                      target. This helps customize the red teaming approach based on your
                      application's specific requirements and constraints.
                    </Typography>
                    <TextField
                      fullWidth
                      value={
                        updates?.applicationDescription?.testGenerationInstructions ??
                        target?.applicationDescription?.testGenerationInstructions ??
                        ''
                      }
                      onChange={(e) =>
                        handleUpdate('applicationDescription', {
                          ...(updates?.applicationDescription ??
                            target?.applicationDescription ??
                            {}),
                          testGenerationInstructions: e.target.value,
                        })
                      }
                      placeholder="e.g. Every test should begin by asking about a health plan, and then ask about a specific health plan"
                      disabled={!canEdit}
                      multiline
                      minRows={3}
                      variant="outlined"
                      sx={{
                        '& .MuiInputBase-inputMultiline': {
                          resize: 'vertical',
                          minHeight: '72px',
                        },
                      }}
                    />
                  </Box>
                </Box>
                <Box
                  sx={{
                    maxWidth: 'max(85%, 1200px)',
                    my: 4,
                    pb: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <Button variant="outlined" onClick={handleBack}>
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    disabled={!canProceedToNext(TabIndex.Context)}
                  >
                    Next
                  </Button>
                </Box>
              </TabPanel>
            )}

            <TabPanel value={activeTab} index={TabIndex.Review}>
              <ReviewPanel target={target} updates={updates} canEdit={canEdit} isNew={isNew} />
              <Box sx={{ mt: 4, pb: 4, display: 'flex', justifyContent: 'space-between' }}>
                <Button variant="outlined" onClick={handleBack}>
                  Back
                </Button>
                {isNew || isDirty ? (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSave}
                    disabled={!canSave}
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save Target'}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() =>
                      navigate(
                        ROUTES.redteam.target.dashboard.replace(
                          ':targetId',
                          encodeURIComponent(target?.id ?? ''),
                        ),
                      )
                    }
                  >
                    Go to Target Overview
                  </Button>
                )}
              </Box>
            </TabPanel>
          </TabContent>
        </Content>
      </MainContent>
    </Root>
  );
}
