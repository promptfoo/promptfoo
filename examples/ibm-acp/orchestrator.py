import asyncio
from acp_sdk.client import Client
from acp_sdk.models import Message, MessagePart
from reportlab.pdfgen import canvas  # Library to generate PDF files

# Helper function to call a specific agent with input text
async def call_agent(client, agent_name, input_text, model):
    # Sends request to ACP agent and returns the content of the response
    run = await client.run_sync(
        agent=agent_name,
        input=[Message(parts=[MessagePart(content=input_text, content_type="text/plain")])]
    )
    return run.output[0].parts[0].content

# Main orchestrator function to run full book creation pipeline
async def main(title="The Quantum Cat's Journey", model="gpt-4o", progress_callback=None):
    async with Client(base_url="http://localhost:8000") as client:
        if progress_callback:
            progress_callback(0.05)  # Update progress bar if using UI (like Gradio)

        # Step 1: Generate book outline
        outline = await call_agent(client, "outline", title, model)
        if progress_callback:
            progress_callback(0.2)

        chapters = []
        # Step 2: Generate 3 chapters (can increase this later if desired)
        for i in range(1, 4):
            chapter_prompt = f"{outline} - Chapter {i}"  # Prepare chapter input
            chapter_content = await call_agent(client, "chapter", chapter_prompt, model)
            if progress_callback:
                progress_callback(0.2 + i * 0.15)

            # Step 3: Edit chapter using editor agent
            edited_chapter = await client.run_sync(
                agent="editor",
                input=[Message(parts=[MessagePart(content=chapter_content, content_type="text/plain")])]
            )
            chapters.append(edited_chapter.output[0].parts[0].content)

        # Step 4: Combine outline + chapters into full book text
        full_book = f"{outline}\n\n" + "\n\n".join(chapters)
        with open("final_book.txt", "w") as f:
            f.write(full_book)
        if progress_callback:
            progress_callback(0.85)

        # Step 5: Export final book to PDF format
        pdf = canvas.Canvas("final_book.pdf")
        pdf.setFont("Helvetica", 12)
        y = 800  # Set initial vertical position on PDF page
        for line in full_book.split("\n"):
            pdf.drawString(50, y, line[:100])  # Draw text line, truncate if too long
            y -= 15  # Move down by 15 pixels
            if y < 50:  # If near bottom, start new page
                pdf.showPage()
                pdf.setFont("Helvetica", 12)
                y = 800
        pdf.save()  # Save the PDF file

        if progress_callback:
            progress_callback(1.0)  # Mark as complete in UI if applicable