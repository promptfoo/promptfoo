import random
import time

import gradio as gr


# Simple chatbot function
def chatbot_response(message, history):
    """Simple chatbot that responds to messages"""
    time.sleep(1)  # Simulate processing time

    responses = {
        "hello": "Hello! How can I help you today?",
        "how are you": "I'm doing great, thank you for asking! How are you?",
        "test": "Test successful! The browser automation is working correctly.",
        "demo": "This is a demo Gradio application for testing browser automation.",
        "help": "I can respond to simple greetings and questions. Try saying 'hello' or asking 'how are you'!",
    }

    # Simple keyword matching
    message_lower = message.lower()
    for keyword, response in responses.items():
        if keyword in message_lower:
            return response

    # Default response
    return f"I received your message: '{message}'. This is a simple demo response!"


# Create the Gradio interface
def create_demo():
    with gr.Blocks(title="Browser Testing Demo") as demo:
        gr.Markdown(
            """
            # 🤖 Browser Automation Test Demo
            
            This is a simple Gradio application designed for testing browser automation with promptfoo.
            
            **Features:**
            - Simple chat interface
            - Predictable responses for testing
            - Clear element identifiers for automation
            """
        )

        chatbot = gr.Chatbot(
            label="Chat History", elem_id="chat-history", type="messages"
        )

        msg = gr.Textbox(
            label="Your Message",
            placeholder="Type a message and press Enter...",
            elem_id="user-input",
        )

        with gr.Row():
            submit = gr.Button("Submit", elem_id="submit-button")
            clear = gr.Button("Clear", elem_id="clear-button")

        # Example messages for testing
        gr.Examples(
            examples=[
                "Hello",
                "How are you?",
                "This is a test",
                "Show me a demo",
                "Help",
            ],
            inputs=msg,
            label="Example Messages",
        )

        # Handle message submission
        def respond(message, chat_history):
            bot_message = chatbot_response(message, chat_history)
            # Use the new messages format with role and content
            chat_history.append({"role": "user", "content": message})
            chat_history.append({"role": "assistant", "content": bot_message})
            return "", chat_history

        # Wire up the interface
        msg.submit(respond, [msg, chatbot], [msg, chatbot])
        submit.click(respond, [msg, chatbot], [msg, chatbot])
        clear.click(lambda: None, None, chatbot, queue=False)

    return demo


# Simple calculator for testing form inputs
def create_calculator_demo():
    with gr.Blocks(title="Calculator Demo") as calc_demo:
        gr.Markdown("## Simple Calculator for Testing")

        with gr.Row():
            num1 = gr.Number(label="First Number", elem_id="num1")
            num2 = gr.Number(label="Second Number", elem_id="num2")

        operation = gr.Radio(
            ["Add", "Subtract", "Multiply", "Divide"],
            label="Operation",
            elem_id="operation",
        )

        calculate_btn = gr.Button("Calculate", elem_id="calculate")
        result = gr.Textbox(label="Result", elem_id="result")

        def calculate(n1, n2, op):
            if op == "Add":
                return str(n1 + n2)
            elif op == "Subtract":
                return str(n1 - n2)
            elif op == "Multiply":
                return str(n1 * n2)
            elif op == "Divide":
                return str(n1 / n2) if n2 != 0 else "Error: Division by zero"

        calculate_btn.click(calculate, [num1, num2, operation], result)

    return calc_demo


if __name__ == "__main__":
    # Create a tabbed interface with multiple demos
    demo1 = create_demo()
    demo2 = create_calculator_demo()

    tabbed_demo = gr.TabbedInterface(
        [demo1, demo2],
        ["Chatbot Demo", "Calculator Demo"],
        title="Browser Automation Test Suite",
    )

    print("Starting Gradio demo server...")
    print("Access the demo at http://localhost:7860")
    print("Use Ctrl+C to stop the server")

    tabbed_demo.launch(server_name="0.0.0.0", server_port=7860, share=False)
