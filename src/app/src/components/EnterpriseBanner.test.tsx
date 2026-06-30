import { ApiRoutes, callApiJson, ServerResponseSchemas } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EnterpriseBanner from './EnterpriseBanner';

vi.mock('@app/utils/api');

describe('EnterpriseBanner', () => {
  const mockCallApiJson = vi.mocked(callApiJson);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the community edition banner when evalId is provided and cloud is not enabled', async () => {
    mockCallApiJson.mockResolvedValue({ domain: 'localhost', isCloudEnabled: false });

    render(<EnterpriseBanner evalId="test-eval-123" />);

    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
    expect(mockCallApiJson).toHaveBeenCalledWith(
      ApiRoutes.Results.ShareCheckDomain,
      ServerResponseSchemas.ShareCheckDomain.Response,
      { query: new URLSearchParams({ id: 'test-eval-123' }) },
    );

    const bannerText = await screen.findByText(
      /You're using the community edition of Promptfoo's red teaming suite/i,
    );
    expect(bannerText).toBeInTheDocument();

    const enterpriseLink = screen.getByRole('link', { name: /Promptfoo Enterprise/i });
    expect(enterpriseLink).toBeInTheDocument();
    expect(enterpriseLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/enterprise/');
  });

  it('should not render anything when evalId is provided and cloud is enabled', async () => {
    mockCallApiJson.mockResolvedValue({ domain: 'localhost', isCloudEnabled: true });

    const { container } = render(<EnterpriseBanner evalId="test-eval-123" />);

    expect(mockCallApiJson).toHaveBeenCalledTimes(1);

    // Wait for the component to finish updating
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should render the community edition banner when no evalId is provided', async () => {
    render(<EnterpriseBanner />);

    expect(mockCallApiJson).not.toHaveBeenCalled();

    const bannerText = await screen.findByText(
      /You're using the community edition of Promptfoo's red teaming suite/i,
    );
    expect(bannerText).toBeInTheDocument();

    const enterpriseLink = screen.getByRole('link', { name: /Promptfoo Enterprise/i });
    expect(enterpriseLink).toBeInTheDocument();
    expect(enterpriseLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/enterprise/');
  });

  it('should render the community edition banner when the API call returns a non-OK response', async () => {
    mockCallApiJson.mockRejectedValue(new Error('No access'));

    render(<EnterpriseBanner evalId="test-eval-123" />);

    expect(mockCallApiJson).toHaveBeenCalledTimes(1);

    const bannerText = await screen.findByText(
      /You're using the community edition of Promptfoo's red teaming suite/i,
    );
    expect(bannerText).toBeInTheDocument();

    const enterpriseLink = screen.getByRole('link', { name: /Promptfoo Enterprise/i });
    expect(enterpriseLink).toBeInTheDocument();
    expect(enterpriseLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/enterprise/');
  });

  it('should render the community edition banner when the API call throws an exception', async () => {
    mockCallApiJson.mockRejectedValue(new Error('Network error'));

    render(<EnterpriseBanner evalId="test-eval-123" />);

    expect(mockCallApiJson).toHaveBeenCalledTimes(1);

    const bannerText = await screen.findByText(
      /You're using the community edition of Promptfoo's red teaming suite/i,
    );
    expect(bannerText).toBeInTheDocument();

    const enterpriseLink = screen.getByRole('link', { name: /Promptfoo Enterprise/i });
    expect(enterpriseLink).toBeInTheDocument();
    expect(enterpriseLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/enterprise/');
  });
});
