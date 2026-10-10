import React, { useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useCartContext } from './CartProvider';
import { formatPrice, getAttributeName, isInStock, stripHtml } from './useFourthwall';

import type { FourthwallBundle } from './types';

export function BundleModal({ bundle }: { bundle: FourthwallBundle }) {
  const { addBundleToCart, closeProductModal, isLoading } = useCartContext();
  const [error, setError] = useState<string | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      bundle.offers.map((offer) => [
        offer.id,
        offer.variants.find((variant) => isInStock(variant.stock))?.id ?? '',
      ]),
    ),
  );
  const canAdd =
    bundle.state.type === 'AVAILABLE' &&
    bundle.offers.length > 0 &&
    bundle.offers.every((offer) => {
      const variant = offer.variants.find(
        (candidate) => candidate.id === selectedVariants[offer.id],
      );
      return offer.state.type === 'AVAILABLE' && variant && isInStock(variant.stock);
    });

  const handleAdd = async () => {
    if (!canAdd || isLoading) return;
    setError(null);
    try {
      await addBundleToCart(
        bundle.id,
        bundle.offers.map((offer) => selectedVariants[offer.id]),
      );
      closeProductModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add bundle. Please try again.');
    }
  };

  return (
    <Dialog
      open
      onClose={closeProductModal}
      fullWidth
      maxWidth="sm"
      aria-labelledby="bundle-title"
      slotProps={{
        paper: {
          sx: {
            backgroundColor: 'var(--ifm-background-color)',
            color: 'var(--ifm-font-color-base)',
          },
        },
      }}
    >
      <DialogTitle id="bundle-title" sx={{ pr: 7 }}>
        {bundle.name}
        <IconButton
          onClick={closeProductModal}
          aria-label="Close"
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {bundle.images[0] && (
          <Box
            component="img"
            src={bundle.images[0].url}
            alt={bundle.name}
            sx={{ width: '100%', maxHeight: 240, objectFit: 'contain', mb: 2 }}
          />
        )}
        <Typography sx={{ mb: 2 }}>{stripHtml(bundle.description)}</Typography>
        {bundle.offers.map((offer) => (
          <FormControl key={offer.id} fullWidth sx={{ my: 1 }}>
            <InputLabel id={`bundle-${offer.id}`}>{offer.name}</InputLabel>
            <Select
              labelId={`bundle-${offer.id}`}
              label={offer.name}
              value={selectedVariants[offer.id] ?? ''}
              onChange={(event) =>
                setSelectedVariants((current) => ({ ...current, [offer.id]: event.target.value }))
              }
            >
              {offer.variants.map((variant) => (
                <MenuItem key={variant.id} value={variant.id} disabled={!isInStock(variant.stock)}>
                  {Object.entries(variant.attributes)
                    .filter(([key]) => key !== 'description')
                    .map(([, value]) => getAttributeName(value))
                    .join(' / ') || variant.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ))}
        <Typography variant="h5" sx={{ mt: 2 }}>
          {bundle.pricingStrategy.type !== 'FIXED_PRICE' && 'From '}
          {formatPrice(bundle.price)}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button variant="contained" fullWidth onClick={handleAdd} disabled={!canAdd || isLoading}>
          {isLoading ? 'Adding…' : canAdd ? 'Add to Cart' : 'Out of Stock'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
