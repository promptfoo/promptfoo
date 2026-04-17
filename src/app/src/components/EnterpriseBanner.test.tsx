import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EnterpriseBanner from './EnterpriseBanner';

vi.mock('@app/utils/api');

describe('EnterpriseBanner', () => {
  const mockCallApi = vi.mocked(callApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the community edition banner when evalId is provided and cloud is not enabled', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isCloudEnabled: false }),
    } as Response);

    render(<EnterpriseBanner evalId="test-eval-123" />);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledWith('/results/share/check-domain?id=test-eval-123');

    const bannerText = await screen.findByText(
      /You're using the community edition of Promptfoo's red teaming suite/i,
    );
    expect(bannerText).toBeInTheDocument();

    const enterpriseLink = screen.getByRole('link', { name: /Promptfoo Enterprise/i });
    expect(enterpriseLink).toBeInTheDocument();
    expect(enterpriseLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/enterprise/');
  });

  it('should not render anything when evalId is provided and cloud is enabled', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isCloudEnabled: true }),
    } as Response);

    const { container } = render(<EnterpriseBanner evalId="test-eval-123" />);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledWith('/results/share/check-domain?id=test-eval-123');

    // Wait for the component to finish updating
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should render the community edition banner when no evalId is provided', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isCloudEnabled: false }),
    } as Response);

    render(<EnterpriseBanner />);

    expect(mockCallApi).not.toHaveBeenCalled();

    const bannerText = await screen.findByText(
      /You're using the community edition of Promptfoo's red teaming suite/i,
    );
    expect(bannerText).toBeInTheDocument();

    const enterpriseLink = screen.getByRole('link', { name: /Promptfoo Enterprise/i });
    expect(enterpriseLink).toBeInTheDocument();
    expect(enterpriseLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/enterprise/');
  });

  it('should render the community edition banner when the API call returns a non-OK response', async () => {
    mockCallApi.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    render(<EnterpriseBanner evalId="test-eval-123" />);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledWith('/results/share/check-domain?id=test-eval-123');

    const bannerText = await screen.findByText(
      /You're using the community edition of Promptfoo's red teaming suite/i,
    );
    expect(bannerText).toBeInTheDocument();

    const enterpriseLink = screen.getByRole('link', { name: /Promptfoo Enterprise/i });
    expect(enterpriseLink).toBeInTheDocument();
    expect(enterpriseLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/enterprise/');
  });

  it('should render the community edition banner when the API call throws an exception', async () => {
    mockCallApi.mockRejectedValue(new Error('Network error'));

    render(<EnterpriseBanner evalId="test-eval-123" />);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledWith('/results/share/check-domain?id=test-eval-123');

    const bannerText = await screen.findByText(
      /You're using the community edition of Promptfoo's red teaming suite/i,
    );
    expect(bannerText).toBeInTheDocument();

    const enterpriseLink = screen.getByRole('link', { name: /Promptfoo Enterprise/i });
    expect(enterpriseLink).toBeInTheDocument();
    expect(enterpriseLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/enterprise/');
  });
});
