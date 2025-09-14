import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import { getProviderDocumentationUrl, hasSpecificDocumentation } from './providerDocumentationMap';

interface ProviderDocumentationLinkProps {
  providerId?: string;
  providerLabel?: string;
  variant?: 'icon' | 'button' | 'link';
  size?: 'small' | 'medium' | 'large';
  showTooltip?: boolean;
}

/**
 * Reusable component for displaying documentation links for specific providers
 */
export default function ProviderDocumentationLink({
  providerId,
  providerLabel,
  variant = 'icon',
  size = 'small',
  showTooltip = true,
}: ProviderDocumentationLinkProps) {
  if (!providerId || !hasSpecificDocumentation(providerId)) {
    return null;
  }

  const docUrl = getProviderDocumentationUrl(providerId);
  const displayName = providerLabel || providerId;
  const tooltipText = `View ${displayName} documentation`;

  const commonProps = {
    href: docUrl,
    target: '_blank' as const,
    rel: 'noopener noreferrer' as const,
    component: Link,
  };

  if (variant === 'icon') {
    const iconButton = (
      <IconButton {...commonProps} size={size} sx={{ color: 'text.secondary' }}>
        <HelpOutlineIcon fontSize={size} />
      </IconButton>
    );

    return showTooltip ? <Tooltip title={tooltipText}>{iconButton}</Tooltip> : iconButton;
  }

  if (variant === 'button') {
    return (
      <Button {...commonProps} variant="outlined" size={size} startIcon={<HelpOutlineIcon />}>
        View Documentation
      </Button>
    );
  }

  // variant === 'link'
  return <Link {...commonProps}>{displayName} documentation</Link>;
}
