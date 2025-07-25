# Sample Images

To test the MTG Card Analyzer, you'll need to add sample images to this directory.

## Available Sample Images

1. **sample_cards.jpg** - A 1000x1000 test image containing multiple MTG cards
   - Ready to use for testing the multi-card detection pipeline
   - Contains various card conditions for grading tests
   - This is the default image used by `python main.py`

## Additional Images You Can Add

1. **single_card.jpg** - A clear photo of a single Magic: The Gathering card
2. **multiple_cards.jpg** - A photo containing 3-5 MTG cards laid out on a surface

## Where to Get Sample Images

### Option 1: Take Your Own Photos
- Use your phone camera to photograph MTG cards
- Ensure good lighting and minimal shadows
- Cards should be clearly visible and not overlapping

### Option 2: Download Sample Images
You can find MTG card images from:
- Scryfall API: https://scryfall.com/docs/api/images
- MTG official card gallery
- Your own collection photos

## Image Requirements
- Format: JPEG or PNG
- Resolution: At least 800x600 pixels
- File size: Under 10MB
- Cards should occupy at least 30% of the image

## Example Setup
```bash
# Add your images to this directory
cp ~/Pictures/my_mtg_card.jpg ./single_card.jpg
cp ~/Pictures/mtg_collection.jpg ./multiple_cards.jpg
```

Once you have images in this directory, you can test the analyzer!