import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useCartContext } from './CartProvider';
import {
  formatPrice,
  getAttributeName,
  getAttributeSwatch,
  isInStock,
  stripHtml,
} from './useFourthwall';

import type { FourthwallAttributeValue } from './types';

export function ProductModal() {
  const { selectedProduct, closeProductModal, addToCart, isLoading } = useCartContext();

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);

  // Touch swipe handling
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const isOpen = selectedProduct !== null;

  // Reset state when product changes
  useEffect(() => {
    if (selectedProduct) {
      setCurrentImageIndex(0);
      setSelectedVariantId(selectedProduct.variants[0]?.id || '');
    }
  }, [selectedProduct]);

  // Get unique attribute options (e.g., sizes, colors)
  // Skip 'description' as it's not a selectable attribute
  const attributeOptions = useMemo(() => {
    if (!selectedProduct) return {};

    const options: Record<string, { name: string; swatch?: string }[]> = {};

    selectedProduct.variants.forEach((variant) => {
      Object.entries(variant.attributes).forEach(([key, value]) => {
        // Skip description attribute - it's just a concatenation of other attrs
        if (key === 'description') return;

        if (!options[key]) {
          options[key] = [];
        }

        const name = getAttributeName(value);
        const swatch = getAttributeSwatch(value);

        // Only add if not already present
        if (!options[key].some((opt) => opt.name === name)) {
          options[key].push({ name, swatch });
        }
      });
    });

    return options;
  }, [selectedProduct]);

  // Current selected variant
  const selectedVariant = useMemo(() => {
    return selectedProduct?.variants.find((v) => v.id === selectedVariantId);
  }, [selectedProduct, selectedVariantId]);

  // Images to show (variant-specific or product-level)
  const images = useMemo(() => {
    if (!selectedProduct) return [];
    // If variant has images, use those; otherwise use product images
    if (selectedVariant?.images && selectedVariant.images.length > 0) {
      return selectedVariant.images;
    }
    return selectedProduct.images;
  }, [selectedProduct, selectedVariant]);

  const handlePrevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevImage();
      } else if (e.key === 'ArrowRight') {
        handleNextImage();
      } else if (e.key === 'Escape') {
        closeProductModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrevImage, handleNextImage, closeProductModal]);

  // Touch swipe handlers for image carousel
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null) return;

    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(swipeDistance) > minSwipeDistance) {
      if (swipeDistance > 0) {
        // Swiped left -> next image
        handleNextImage();
      } else {
        // Swiped right -> previous image
        handlePrevImage();
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  }, [handleNextImage, handlePrevImage]);

  const handleAddToCart = async () => {
    if (!selectedVariantId) return;

    setIsAdding(true);
    try {
      await addToCart(selectedVariantId, 1);
      closeProductModal();
    } catch {
      // Error is handled by the cart context
    } finally {
      setIsAdding(false);
    }
  };

  // Find variant by selected attributes (comparing by name string)
  const handleAttributeChange = (attributeName: string, newValue: string) => {
    if (!selectedProduct) return;

    // Build a map of current attribute names
    const currentAttrNames: Record<string, string> = {};
    if (selectedVariant) {
      Object.entries(selectedVariant.attributes).forEach(([key, val]) => {
        if (key !== 'description') {
          currentAttrNames[key] = getAttributeName(val);
        }
      });
    }

    // Update with the new value
    currentAttrNames[attributeName] = newValue;

    // Find a variant that matches all current attribute names
    const matchingVariant = selectedProduct.variants.find((v) =>
      Object.entries(currentAttrNames).every(
        ([key, name]) => v.attributes[key] && getAttributeName(v.attributes[key]) === name,
      ),
    );

    if (matchingVariant) {
      setSelectedVariantId(matchingVariant.id);
    } else {
      // Fallback: find any variant with the selected attribute name
      const fallbackVariant = selectedProduct.variants.find(
        (v) =>
          v.attributes[attributeName] && getAttributeName(v.attributes[attributeName]) === newValue,
      );
      if (fallbackVariant) {
        setSelectedVariantId(fallbackVariant.id);
      }
    }
  };

  if (!selectedProduct) return null;

  const hasMultipleImages = images.length > 1;
  const hasVariants = selectedProduct.variants.length > 1;

  return (
    <Dialog
      open={isOpen}
      onClose={closeProductModal}
      maxWidth={false}
      fullScreen
      PaperProps={{
        sx: {
          // Fullscreen on mobile, constrained on larger screens
          width: { xs: '100%', sm: '90vw' },
          maxWidth: { xs: '100%', sm: '1000px' },
          height: { xs: '100%', sm: '85vh' },
          maxHeight: { xs: '100%', sm: '800px' },
          m: { xs: 0, sm: 2 },
          borderRadius: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      sx={{
        // Override fullScreen on larger viewports
        '& .MuiDialog-container': {
          alignItems: { xs: 'stretch', sm: 'center' },
        },
      }}
    >
      {/* Header bar - OpenAI Supply style */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          backgroundColor: '#1a1a2e',
          color: '#fff',
          flexShrink: 0,
          gap: 1,
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {selectedProduct.name}
        </Typography>
        <IconButton
          onClick={closeProductModal}
          size="small"
          sx={{
            color: '#fff',
            '&:hover': {
              backgroundColor: 'rgba(255,255,255,0.1)',
            },
          }}
          aria-label="Close"
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content area */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Image carousel */}
        <Box
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          sx={{
            flex: { xs: '0 0 auto', md: '1 1 60%' },
            position: 'relative',
            backgroundColor: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: { xs: '250px', sm: '300px', md: 'auto' },
            maxHeight: { xs: '40vh', md: 'none' },
            // Improve touch scrolling
            touchAction: 'pan-y pinch-zoom',
            cursor: hasMultipleImages ? 'grab' : 'default',
          }}
        >
          {images[currentImageIndex] && (
            <Box
              component="img"
              src={images[currentImageIndex].url}
              alt={`${selectedProduct.name} - Image ${currentImageIndex + 1}`}
              sx={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          )}

          {/* Navigation arrows */}
          {hasMultipleImages && (
            <>
              <IconButton
                onClick={handlePrevImage}
                sx={{
                  position: 'absolute',
                  left: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  '&:hover': {
                    backgroundColor: '#fff',
                  },
                }}
                aria-label="Previous image"
              >
                <ChevronLeftIcon />
              </IconButton>
              <IconButton
                onClick={handleNextImage}
                sx={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  '&:hover': {
                    backgroundColor: '#fff',
                  },
                }}
                aria-label="Next image"
              >
                <ChevronRightIcon />
              </IconButton>

              {/* Image indicators */}
              <Box
                component="nav"
                aria-label="Image navigation"
                sx={{
                  position: 'absolute',
                  bottom: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: 1,
                }}
              >
                {images.map((_, index) => (
                  <Box
                    key={index}
                    component="button"
                    type="button"
                    onClick={() => setCurrentImageIndex(index)}
                    aria-label={`Go to image ${index + 1} of ${images.length}`}
                    aria-current={index === currentImageIndex ? 'true' : undefined}
                    sx={{
                      width: 8,
                      height: 8,
                      padding: 0,
                      border: 'none',
                      borderRadius: '50%',
                      backgroundColor: index === currentImageIndex ? '#000' : 'rgba(0,0,0,0.3)',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      '&:hover': {
                        backgroundColor: index === currentImageIndex ? '#000' : 'rgba(0,0,0,0.5)',
                      },
                      '&:focus-visible': {
                        outline: '2px solid #1a1a2e',
                        outlineOffset: 2,
                      },
                    }}
                  />
                ))}
              </Box>
            </>
          )}
        </Box>

        {/* Product details */}
        <Box
          sx={{
            flex: { xs: '1 1 auto', md: '1 1 40%' },
            p: { xs: 2, sm: 3 },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Description */}
          {selectedProduct.description && (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                mb: 3,
                lineHeight: 1.6,
              }}
            >
              {stripHtml(selectedProduct.description)}
            </Typography>
          )}

          {/* Variant selectors */}
          {hasVariants && Object.keys(attributeOptions).length > 0 && (
            <Box sx={{ mb: 3 }}>
              {Object.entries(attributeOptions).map(([attrName, options]) => {
                // Get current selected value as string
                const currentValue = selectedVariant?.attributes[attrName]
                  ? getAttributeName(selectedVariant.attributes[attrName])
                  : '';

                return (
                  <FormControl key={attrName} fullWidth sx={{ mb: 2 }} size="small">
                    <InputLabel id={`${attrName}-label`}>
                      {attrName.charAt(0).toUpperCase() + attrName.slice(1)}
                    </InputLabel>
                    <Select
                      labelId={`${attrName}-label`}
                      value={currentValue}
                      label={attrName.charAt(0).toUpperCase() + attrName.slice(1)}
                      onChange={(e) => handleAttributeChange(attrName, e.target.value)}
                    >
                      {options.map((option) => (
                        <MenuItem key={option.name} value={option.name}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {option.swatch && (
                              <Box
                                sx={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: '50%',
                                  backgroundColor: option.swatch,
                                  border: '1px solid #ddd',
                                }}
                              />
                            )}
                            {option.name}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                );
              })}
            </Box>
          )}

          {/* Price */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {selectedVariant ? formatPrice(selectedVariant.unitPrice) : '—'}
            </Typography>
            {selectedVariant?.compareAtPrice && (
              <Typography
                variant="body2"
                sx={{
                  textDecoration: 'line-through',
                  color: 'text.secondary',
                }}
              >
                {formatPrice(selectedVariant.compareAtPrice)}
              </Typography>
            )}
          </Box>

          {/* Stock status */}
          {selectedVariant && !isInStock(selectedVariant.stock) && (
            <Typography variant="body2" sx={{ color: 'error.main', mb: 2 }}>
              Out of stock
            </Typography>
          )}

          {/* Add to cart button */}
          <Button
            variant="contained"
            size="large"
            onClick={handleAddToCart}
            disabled={
              !selectedVariant || !isInStock(selectedVariant.stock) || isAdding || isLoading
            }
            sx={{
              mt: 'auto',
              py: { xs: 1.75, sm: 1.5 },
              minHeight: { xs: 48, sm: 44 },
              fontSize: { xs: '0.875rem', sm: '1rem' },
              backgroundColor: '#1a1a2e',
              borderRadius: 0,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              // Prevent iOS zoom on input
              touchAction: 'manipulation',
              '&:hover': {
                backgroundColor: '#2a2a4e',
              },
              '&:disabled': {
                backgroundColor: '#ccc',
              },
            }}
          >
            {isAdding ? (
              <CircularProgress size={24} sx={{ color: '#fff' }} />
            ) : selectedVariant && isInStock(selectedVariant.stock) ? (
              'Add to Cart'
            ) : (
              'Out of Stock'
            )}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
