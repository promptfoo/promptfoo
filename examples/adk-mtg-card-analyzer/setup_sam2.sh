#!/bin/bash
# Setup script for SAM2 installation

echo "🚀 Setting up SAM2 for MTG Card Analyzer..."

# Check if we're in the right directory
if [ ! -f "requirements.txt" ]; then
    echo "❌ Please run this script from the adk-mtg-card-analyzer directory"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate || . venv/Scripts/activate

# Install base requirements
echo "📦 Installing base requirements..."
pip install -r requirements.txt

# Install PyTorch with CUDA support (adjust based on your system)
echo "🔧 Installing PyTorch..."
if command -v nvidia-smi &> /dev/null; then
    echo "✅ CUDA detected, installing PyTorch with CUDA support..."
    pip install torch>=2.5.1 torchvision>=0.20.1 --index-url https://download.pytorch.org/whl/cu121
else
    echo "⚠️  No CUDA detected, installing CPU-only PyTorch..."
    pip install torch>=2.5.1 torchvision>=0.20.1
fi

# Clone and install SAM2
if [ ! -d "sam2" ]; then
    echo "📥 Cloning SAM2 repository..."
    git clone https://github.com/facebookresearch/sam2.git
fi

echo "📦 Installing SAM2..."
cd sam2
pip install -e .
cd ..

# Create checkpoints directory
mkdir -p checkpoints

echo "
✅ SAM2 setup complete!

📝 Next steps:
1. Download SAM2 checkpoints from: https://github.com/facebookresearch/sam2#model-checkpoints
2. Place checkpoint files in the 'checkpoints' directory
3. Run: python test_sam2_segmentation.py

🎯 To use SAM2 in main.py:
   python main.py --segmentation-mode sam2
"