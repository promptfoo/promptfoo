import asyncio
import os
import shutil

import gradio as gr
from orchestrator import main  # Import orchestrator to run agent pipeline

# Async function to generate the book using orchestrator and update Gradio progress bar
async def generate_book_async(title, model, progress=gr.Progress()):
    # Clear old book files if they exist
    for file in ["final_book.txt", "final_book.pdf"]:
        if os.path.exists(file):
            os.remove(file)

    # Run the orchestrator with given title + model, passing in progress callback
    await main(title, model=model, progress_callback=progress)

    # Read final book text from generated TXT file
    with open("final_book.txt", "r") as f:
        book_text = f.read()

    # Return book text + file paths for download components
    return book_text, "final_book.txt", "final_book.pdf"

# Wrapper to run async function inside sync Gradio button click
def generate_book(title, model):
    return asyncio.run(generate_book_async(title, model))

# Build Gradio interface
with gr.Blocks() as demo:
    gr.Markdown("# 🐱 Quantum Cat Book Generator")  # App title
    gr.Markdown("Enter a book title, pick a model, and generate a complete polished book with TXT and PDF downloads.")

    with gr.Row():
        title_input = gr.Textbox(label="Title", placeholder="Enter book title...")  # Input box for title
        model_selector = gr.Dropdown(choices=["gpt-4o", "gpt-3.5-turbo"], value="gpt-4o", label="Model")  # Model dropdown

    output_text = gr.Textbox(label="Generated Book", lines=20)  # Output textbox to display book
    txt_download = gr.File(label="Download TXT")  # Download button for .txt
    pdf_download = gr.File(label="Download PDF")  # Download button for .pdf

    generate_btn = gr.Button("🚀 Generate Book")  # Main action button

    # Link button click to generate_book function with inputs and outputs
    generate_btn.click(
        fn=generate_book,
        inputs=[title_input, model_selector],
        outputs=[output_text, txt_download, pdf_download]
    )

# Launch Gradio app on localhost:7860
demo.launch()