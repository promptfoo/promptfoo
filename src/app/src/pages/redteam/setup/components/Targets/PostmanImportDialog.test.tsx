import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PostmanImportDialog from './PostmanImportDialog';

const renderDialog = (onImport = vi.fn()) => {
  render(<PostmanImportDialog open onClose={vi.fn()} onImport={onImport} />);
  return onImport;
};

describe('PostmanImportDialog', () => {
  it('labels the pasted collection and explains what importing will configure', () => {
    renderDialog();

    const jsonInput = screen.getByLabelText('Postman collection JSON');
    expect(jsonInput).toHaveAccessibleDescription(
      /fills this provider's URL, method, headers, and request body/i,
    );
    expect(screen.getByRole('button', { name: 'Parse Collection' })).toBeDisabled();
  });

  it('associates a clear parse error with invalid collection JSON and clears it on editing', async () => {
    const user = userEvent.setup();
    renderDialog();

    const jsonInput = screen.getByLabelText('Postman collection JSON');
    await user.click(jsonInput);
    await user.paste('{invalid');
    await user.click(screen.getByRole('button', { name: 'Parse Collection' }));

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('This is not valid Postman collection JSON');
    expect(jsonInput).toHaveAttribute('aria-invalid', 'true');
    expect(jsonInput).toHaveAttribute('aria-describedby', expect.stringContaining(error.id));

    await user.type(jsonInput, '}');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(jsonInput).toHaveAttribute('aria-invalid', 'false');
  });

  it('explains when valid JSON does not contain an importable Postman request', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByLabelText('Postman collection JSON'));
    await user.paste(JSON.stringify({ item: { invalid: true } }));
    await user.click(screen.getByRole('button', { name: 'Parse Collection' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No valid requests found. Paste a Postman collection or standalone request.',
    );
  });

  it('labels the selected request and imports the fields that will populate the provider', async () => {
    const user = userEvent.setup();
    const onImport = renderDialog();
    const collection = {
      request: {
        method: 'POST',
        url: 'https://api.example.com/chat',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{"message":"{{user_message}}"}' },
      },
    };

    await user.click(screen.getByLabelText('Postman collection JSON'));
    await user.paste(JSON.stringify(collection));
    await user.click(screen.getByRole('button', { name: 'Parse Collection' }));

    expect(screen.getByLabelText('Request to import')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import Selected Request' }));

    expect(onImport).toHaveBeenCalledWith({
      url: 'https://api.example.com/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"message":"{{prompt}}"}',
    });
  });
});
