"""Exercise the demo through Gradio's component processing and event callbacks."""

import unittest

from gradio_demo import create_calculator_demo, create_demo


class GradioDemoTest(unittest.IsolatedAsyncioTestCase):
    async def test_chat_accepts_messages_and_preserves_history(self) -> None:
        demo = create_demo()
        self.addCleanup(demo.close)

        submit = next(fn for fn in demo.fns.values() if fn.api_name == "respond")
        response = await demo.process_api(submit, inputs=["Hello", []])
        textbox, history = response["data"]
        self.assertEqual(textbox, "")
        self.assertEqual(
            [message["role"] for message in history], ["user", "assistant"]
        )
        self.assertEqual(
            history[-1]["content"][0]["text"], "Hello! How can I help you today?"
        )

        # The button callback must accept the serialized history from the first turn.
        click = next(fn for fn in demo.fns.values() if fn.api_name == "respond_1")
        response = await demo.process_api(click, inputs=["This is a test", history])
        _, history = response["data"]
        self.assertEqual(len(history), 4)
        self.assertEqual(history[0]["content"][0]["text"], "Hello")
        self.assertEqual(
            history[-1]["content"][0]["text"],
            "Test successful! The browser automation is working correctly.",
        )

    async def test_calculator_processes_inputs_and_division_by_zero(self) -> None:
        demo = create_calculator_demo()
        self.addCleanup(demo.close)

        calculate = next(fn for fn in demo.fns.values() if fn.api_name == "calculate")
        cases = [
            (10, 5, "Add", "15"),
            (20, 4, "Subtract", "16"),
            (20, 4, "Multiply", "80"),
            (20, 4, "Divide", "5.0"),
            (20, 0, "Divide", "Error: Division by zero"),
        ]
        for first, second, operation, expected in cases:
            with self.subTest(operation=operation, second=second):
                response = await demo.process_api(
                    calculate, inputs=[first, second, operation]
                )
                self.assertEqual(response["data"], [expected])


if __name__ == "__main__":
    unittest.main()
