"""
Flask server that loads a Hugging Face model once and serves predictions.
This avoids the overhead of reloading the model for each prompt.
"""

import os
import sys
import signal
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global variables for model and tokenizer
model = None
tokenizer = None
device = None

def load_model():
    """Load the Llama 4 model and tokenizer."""
    global model, tokenizer, device
    
    model_name = os.getenv('MODEL_NAME', 'meta-llama/Llama-3.2-1B')  # Use smaller Llama model for demo
    logger.info(f"Loading model: {model_name}")
    
    try:
        # Set device
        if torch.cuda.is_available():
            device = torch.device("cuda")
            logger.info(f"Using GPU: {torch.cuda.get_device_name(0)}")
        elif torch.backends.mps.is_available():
            device = torch.device("mps")
            logger.info("Using Apple Metal Performance Shaders")
        else:
            device = torch.device("cpu")
            logger.info("Using CPU")
        
        # Load tokenizer and model
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=torch.float16 if device.type != "cpu" else torch.float32,
            device_map="auto"
        )
        
        # Set pad token if not already set
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
            if hasattr(model.config, 'pad_token_id'):
                model.config.pad_token_id = tokenizer.eos_token_id
        
        logger.info(f"Model loaded successfully on {device}")
        logger.info(f"Model size: {sum(p.numel() for p in model.parameters()) / 1e9:.2f}B parameters")
        
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        sys.exit(1)

@app.route('/generate', methods=['POST'])
def generate():
    """Generate text from the loaded model."""
    try:
        data = request.json
        prompt = data.get('prompt', '')
        max_length = data.get('max_length', 100)
        temperature = data.get('temperature', 0.7)
        
        # Tokenize input
        inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(device)
        
        # Generate with attention mask
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_length=max_length,
                temperature=temperature,
                do_sample=True,
                pad_token_id=tokenizer.pad_token_id,
                num_return_sequences=1
            )
        
        # Decode output
        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Remove the input prompt from the generated text
        if generated_text.startswith(prompt):
            generated_text = generated_text[len(prompt):].strip()
        
        return jsonify({
            'output': generated_text,
            'model': os.getenv('MODEL_NAME', 'meta-llama/Llama-3.2-1B')
        })
        
    except Exception as e:
        logger.error(f"Generation error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'device': str(device) if device else 'not set'
    })

def signal_handler(sig, frame):
    """Handle shutdown gracefully."""
    logger.info('Shutting down server...')
    sys.exit(0)

if __name__ == '__main__':
    # Register signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Load model before starting server
    load_model()
    
    # Start Flask server
    port = int(os.getenv('PORT', 5000))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port) 