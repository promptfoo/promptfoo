import asyncio
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from python import persistent_wrapper


class TestPersistentWrapper(unittest.TestCase):
    def test_call_method_sync(self) -> None:
        """Tests call_method with a synchronous function."""

        def sync_func(a, b):
            return a + b

        result = persistent_wrapper.call_method(sync_func, [2, 3])
        self.assertEqual(result, 5)

    def test_call_method_async(self) -> None:
        """Tests call_method with an asynchronous function."""

        async def async_func(a, b):
            await asyncio.sleep(0.01)
            return a * b

        result = persistent_wrapper.call_method(async_func, [3, 4])
        self.assertEqual(result, 12)

    def test_load_user_module(self) -> None:
        """Tests loading a user module from a file."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write("def test_func(x):\n    return x * 2\n")
            f.flush()
            script_path = f.name

        try:
            module = persistent_wrapper.load_user_module(script_path)
            self.assertTrue(hasattr(module, "test_func"))
            self.assertEqual(module.test_func(5), 10)
        finally:
            os.unlink(script_path)

    def test_load_user_module_not_found(self) -> None:
        """Tests loading a non-existent module raises FileNotFoundError."""
        with self.assertRaises(FileNotFoundError):
            persistent_wrapper.load_user_module("/nonexistent/path.py")

    def test_get_callable_function(self) -> None:
        """Tests getting a top-level function from a module."""
        mock_module = MagicMock()
        mock_module.my_func = lambda x: x

        result = persistent_wrapper.get_callable(mock_module, "my_func")
        self.assertEqual(result, mock_module.my_func)

    def test_get_callable_class_method(self) -> None:
        """Tests getting a class method using 'Class.method' syntax."""
        mock_module = MagicMock()
        mock_module.MyClass.my_method = lambda x: x

        result = persistent_wrapper.get_callable(mock_module, "MyClass.my_method")
        self.assertEqual(result, mock_module.MyClass.my_method)

    def test_get_callable_not_found(self) -> None:
        """Tests that AttributeError is raised with helpful message."""
        mock_module = MagicMock(spec=["existing_func"])
        mock_module.__name__ = "test_module"
        mock_module.existing_func = lambda: None

        with self.assertRaises(AttributeError) as context:
            persistent_wrapper.get_callable(mock_module, "nonexistent_func")

        error_message = str(context.exception)
        self.assertIn("nonexistent_func", error_message)
        self.assertIn("not found", error_message)

    def test_call_method_detects_async_correctly(self) -> None:
        """Tests that call_method correctly identifies async functions.

        This test ensures we're using inspect.iscoroutinefunction (not
        asyncio.iscoroutinefunction which is deprecated in Python 3.12+).
        """

        async def real_async_func():
            return "async"

        def real_sync_func():
            return "sync"

        # Test that async function is detected and run with asyncio.run
        with patch("asyncio.run", return_value="mocked_async") as mock_run:
            # Using a real async function
            result = persistent_wrapper.call_method(real_async_func, [])
            mock_run.assert_called_once()
            self.assertEqual(result, "mocked_async")

        # Test that sync function bypasses asyncio.run
        with patch("asyncio.run") as mock_run:
            result = persistent_wrapper.call_method(real_sync_func, [])
            mock_run.assert_not_called()
            self.assertEqual(result, "sync")


if __name__ == "__main__":
    unittest.main()
