import React from 'react';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RemoveIcon from '@mui/icons-material/Remove';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useCartContext } from './CartProvider';
import { formatPrice, getAttributeName, getCheckoutUrl } from './useFourthwall';

export function CartDrawer() {
  const { cart, isCartOpen, closeCart, removeFromCart, updateQuantity, isLoading } =
    useCartContext();

  const handleCheckout = () => {
    if (cart?.id) {
      // Get currency from first item in cart, or default to USD
      const currency = cart.items[0]?.variant?.unitPrice?.currency || 'USD';
      window.location.href = getCheckoutUrl(cart.id, currency);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isCartOpen}
      onClose={closeCart}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: '400px' },
          maxWidth: '100vw',
          // Support safe area insets for notched phones
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: { xs: 1.5, sm: 2 },
          borderBottom: '1px solid #eee',
          minHeight: { xs: 56, sm: 64 },
        }}
      >
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, fontSize: { xs: '1.1rem', sm: '1.25rem' } }}
        >
          Cart
        </Typography>
        <IconButton
          onClick={closeCart}
          aria-label="Close cart"
          sx={{
            minWidth: 44,
            minHeight: 44,
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Cart items */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {!cart || cart.items.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
              color: 'text.secondary',
            }}
          >
            <Typography variant="body1">Your cart is empty</Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              opacity: isLoading ? 0.6 : 1,
              transition: 'opacity 0.2s ease-in-out',
              pointerEvents: isLoading ? 'none' : 'auto',
            }}
          >
            {cart.items.map((item) => {
              // Get image from variant first, then product, with fallbacks
              const image = item.variant?.images?.[0] || item.variant?.product?.images?.[0] || null;
              const productName = item.variant?.product?.name || item.variant?.name || 'Product';

              return (
                <Box
                  key={item.variant.id}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    pb: 2,
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  {/* Product image */}
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      flexShrink: 0,
                      backgroundColor: '#f5f5f5',
                      overflow: 'hidden',
                    }}
                  >
                    {image && (
                      <Box
                        component="img"
                        src={image.url}
                        alt={productName}
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                  </Box>

                  {/* Product details */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        mb: 0.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {productName}
                    </Typography>

                    {/* Variant attributes */}
                    {item.variant?.attributes &&
                      Object.entries(item.variant.attributes).length > 0 && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block' }}
                        >
                          {Object.entries(item.variant.attributes)
                            .filter(([key]) => key !== 'description')
                            .map(([_, value]) => getAttributeName(value))
                            .join(' / ')}
                        </Typography>
                      )}

                    {item.variant?.unitPrice && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {formatPrice(item.variant.unitPrice)}
                      </Typography>
                    )}

                    {/* Quantity controls */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mt: 1,
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => {
                          if (item.quantity > 1) {
                            updateQuantity(item.variant.id, item.quantity - 1);
                          }
                        }}
                        disabled={isLoading || item.quantity <= 1}
                        sx={{
                          border: '1px solid #ddd',
                          borderRadius: 0,
                          p: 0.5,
                          minWidth: 36,
                          minHeight: 36,
                          touchAction: 'manipulation',
                        }}
                        aria-label="Decrease quantity"
                      >
                        <RemoveIcon fontSize="small" />
                      </IconButton>

                      <Typography variant="body2" sx={{ minWidth: 28, textAlign: 'center' }}>
                        {item.quantity}
                      </Typography>

                      <IconButton
                        size="small"
                        onClick={() => updateQuantity(item.variant.id, item.quantity + 1)}
                        disabled={isLoading}
                        sx={{
                          border: '1px solid #ddd',
                          borderRadius: 0,
                          p: 0.5,
                          minWidth: 36,
                          minHeight: 36,
                          touchAction: 'manipulation',
                        }}
                        aria-label="Increase quantity"
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>

                      <IconButton
                        size="small"
                        onClick={() => removeFromCart(item.variant.id)}
                        disabled={isLoading}
                        sx={{
                          ml: 'auto',
                          minWidth: 36,
                          minHeight: 36,
                          touchAction: 'manipulation',
                        }}
                        aria-label="Remove item"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer with total and checkout */}
      {cart && cart.items.length > 0 && (
        <Box sx={{ p: 2, borderTop: '1px solid #eee' }}>
          {cart.subtotal && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                mb: 2,
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                Subtotal
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {formatPrice(cart.subtotal)}
              </Typography>
            </Box>
          )}

          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Shipping and taxes calculated at checkout
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleCheckout}
            disabled={isLoading}
            sx={{
              py: { xs: 1.75, sm: 1.5 },
              minHeight: { xs: 48, sm: 44 },
              backgroundColor: '#1a1a2e',
              borderRadius: 0,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              touchAction: 'manipulation',
              '&:hover': {
                backgroundColor: '#2a2a4e',
              },
            }}
          >
            {isLoading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Checkout'}
          </Button>
        </Box>
      )}
    </Drawer>
  );
}
