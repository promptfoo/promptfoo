#!/bin/bash

echo "Creating test pickle file with potential security issues..."

# Create a test pickle with some patterns that will trigger checks
cat > /tmp/test_model_security.py << 'EOF'
import pickle
import numpy as np

# Create a model-like structure with various patterns
model_data = {
    'weights': np.random.randn(100, 50),
    'bias': np.random.randn(50),
    'config': {
        'model_name': 'test_model',
        'version': '1.0.0',
        'framework': 'pytorch',
        # This will trigger secrets detection
        'api_key': 'sk-test123456789',
        'password': 'secret123',
    },
    'metadata': {
        'trained_on': '2024-01-01',
        'dataset': 'test_dataset',
    },
    # This will trigger dangerous pattern detection
    '__reduce__': lambda: (eval, ('print("test")',)),
}

# Save with different protocol versions to test checks
with open('/tmp/test_model_v4.pkl', 'wb') as f:
    pickle.dump(model_data, f, protocol=4)

print("Test files created successfully!")
EOF

python /tmp/test_model_security.py

echo ""
echo "Running modelaudit scan with JSON output to see all checks..."
echo ""

cd /Users/mdangelo/projects/pf3/modelaudit
rye run modelaudit scan -f json /tmp/test_model_v4.pkl | python -m json.tool | head -100

echo ""
echo "To test in the web UI:"
echo "1. Start the dev server: npm run dev"
echo "2. Navigate to http://localhost:5173/model-audit"
echo "3. Add path: /tmp/test_model_v4.pkl"
echo "4. Click 'Run Scan'"
echo "5. View the new Security Dashboard with all checks!"