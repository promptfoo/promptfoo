import os
import sys
import unittest
from unittest.mock import MagicMock, mock_open, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from python import wrapper


class TestWrapper(unittest.TestCase):
    def create_temp_script(self, content: str) -> str:
        """Creates a mock temporary script with the given content.

        Args:
            content: The content of the mock script.

        Returns:
            A string representing the path to the mock script.
        """
        with patch("builtins.open", mock_open(read_data=content)):
            return "/path/to/mock_script.py"

    def test_call_method_sync(self) -> None:
        """Tests the call_method function with a synchronous function.

        This test creates a mock script with a synchronous function,
        patches the necessary modules, and verifies that call_method
        correctly executes the function and returns the expected result.
        """
        script_content = """
def test_function(arg1, arg2):
    return arg1 + arg2
"""
        script_path = self.create_temp_script(script_content)
        with patch("importlib.util.spec_from_file_location") as mock_spec:
            mock_module = MagicMock()
            mock_module.test_function.return_value = 3
            mock_spec.return_value.loader.exec_module.side_effect = lambda m: setattr(
                m, "test_function", mock_module.test_function
            )
            result = wrapper.call_method(script_path, "test_function", 1, 2)
            self.assertEqual(result, 3)

    def test_call_method_async(self) -> None:
        """Tests the call_method function with an asynchronous function.

        This test creates a mock script with an asynchronous function,
        patches the necessary modules and asyncio functions, and verifies
        that call_method correctly executes the async function and returns
        the expected result.
        """
        script_content = """
import asyncio

async def test_async_function(arg1, arg2):
    await asyncio.sleep(0.1)
    return arg1 * arg2
"""
        script_path = self.create_temp_script(script_content)
        with patch("importlib.util.spec_from_file_location") as mock_spec:
            mock_module = MagicMock()
            mock_module.test_async_function = MagicMock()
            mock_module.test_async_function.return_value = 12
            mock_spec.return_value.loader.exec_module.side_effect = lambda m: setattr(
                m, "test_async_function", mock_module.test_async_function
            )
            with (
                patch("asyncio.iscoroutinefunction", return_value=True),
                patch("asyncio.run", return_value=12),
            ):
                result = wrapper.call_method(script_path, "test_async_function", 3, 4)
                self.assertEqual(result, 12)

    def test_call_method_nonexistent_script(self) -> None:
        """Tests the call_method function with a nonexistent script.

        This test verifies that call_method raises a FileNotFoundError
        when trying to execute a method from a nonexistent script.
        """
        with self.assertRaises(FileNotFoundError):
            wrapper.call_method("/path/to/nonexistent/script.py", "some_method")

    def test_call_method_with_classmethod(self) -> None:
        """Tests the call_method function with methods that are Python's classmethods or staticmethods.

        This test creates a mock script with a classmethod,
        patches the necessary modules, and verifies that call_method
        correctly executes the classmethod and returns the expected result.
        """
        script_content = """
class TestClass:
    @classmethod
    def test_classmethod(cls, arg1, arg2):
        return arg1 - arg2
"""

        script_path = self.create_temp_script(script_content)
        with patch("importlib.util.spec_from_file_location") as mock_spec:
            mock_module = MagicMock()
            mock_module.TestClass.test_classmethod.return_value = 3
            mock_spec.return_value.loader.exec_module.side_effect = lambda m: setattr(
                m, "TestClass", mock_module.TestClass
            )
            result = wrapper.call_method(
                script_path, "TestClass.test_classmethod", 4, 1
            )
            self.assertEqual(result, 3)


if __name__ == "__main__":
    unittest.main()
