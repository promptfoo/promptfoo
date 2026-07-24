import os
import sys
import tempfile
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

        # Create a real async function to avoid MagicMock + inspect recursion issues
        async def fake_async(*args):
            return 12

        with patch("importlib.util.spec_from_file_location") as mock_spec:
            mock_spec.return_value.loader.exec_module.side_effect = lambda m: setattr(
                m, "test_async_function", fake_async
            )
            with patch("asyncio.run", return_value=12):
                result = wrapper.call_method(script_path, "test_async_function", 3, 4)
                self.assertEqual(result, 12)

    def test_call_method_nonexistent_script(self) -> None:
        """Tests the call_method function with a nonexistent script.

        This test verifies that call_method raises a FileNotFoundError
        when trying to execute a method from a nonexistent script.
        """
        with self.assertRaises(FileNotFoundError):
            wrapper.call_method("/path/to/nonexistent/script.py", "some_method")

    def test_call_method_rejects_non_python_source(self) -> None:
        """Only Python source extensions may be loaded as executable modules."""
        with tempfile.TemporaryDirectory() as temp_dir:
            text_path = os.path.join(temp_dir, "grader.txt")
            with open(text_path, "w", encoding="utf-8") as script:
                script.write("def grade():\n    return True\n")

            with self.assertRaises(ImportError):
                wrapper.call_method(text_path, "grade")

    def test_call_method_does_not_replace_dangling_mixed_case_symlink(self) -> None:
        """An explicitly requested symlink is not replaced by a lowercase file."""
        with tempfile.TemporaryDirectory() as temp_dir:
            lowercase_path = os.path.join(temp_dir, "grader.py")
            mixed_case_path = os.path.join(temp_dir, "grader.PY")
            with open(lowercase_path, "w", encoding="utf-8") as script:
                script.write("def grade():\n    return 'lowercase'\n")
            try:
                os.symlink(os.path.join(temp_dir, "missing.py"), mixed_case_path)
            except (NotImplementedError, OSError) as error:
                self.skipTest(f"symlinks are unavailable: {error}")

            with self.assertRaises(FileNotFoundError):
                wrapper.call_method(mixed_case_path, "grade")

    def test_call_method_normalizes_mixed_case_extension(self) -> None:
        """A mixed-case reference can resolve an existing lowercase source file."""
        with tempfile.TemporaryDirectory() as temp_dir:
            lowercase_path = os.path.join(temp_dir, "grader.py")
            mixed_case_path = os.path.join(temp_dir, "grader.PY")
            with open(lowercase_path, "w", encoding="utf-8") as script:
                script.write("def grade():\n    return 'lowercase'\n")

            self.assertEqual(wrapper.call_method(mixed_case_path, "grade"), "lowercase")

    def test_call_method_loads_actual_mixed_case_file(self) -> None:
        """An actual mixed-case source file is loaded with SourceFileLoader."""
        with tempfile.TemporaryDirectory() as temp_dir:
            mixed_case_path = os.path.join(temp_dir, "grader.PY")
            with open(mixed_case_path, "w", encoding="utf-8") as script:
                script.write("def grade():\n    return 'mixed-case'\n")

            self.assertEqual(
                wrapper.call_method(mixed_case_path, "grade"), "mixed-case"
            )

    def test_call_method_preserves_distinct_mixed_case_file(self) -> None:
        """Do not substitute or reuse bytecode from a distinct lowercase file."""
        with tempfile.TemporaryDirectory() as temp_dir:
            lowercase_path = os.path.join(temp_dir, "grader.py")
            mixed_case_path = os.path.join(temp_dir, "grader.PY")
            with open(lowercase_path, "w", encoding="utf-8") as script:
                script.write("def grade():\n    return 'lower'\n")

            if os.path.exists(mixed_case_path):
                self.skipTest("filesystem is case-insensitive")

            with open(mixed_case_path, "w", encoding="utf-8") as script:
                script.write("def grade():\n    return 'UPPER'\n")

            timestamp = 1_700_000_000
            os.utime(lowercase_path, (timestamp, timestamp))
            os.utime(mixed_case_path, (timestamp, timestamp))

            self.assertEqual(wrapper.call_method(lowercase_path, "grade"), "lower")

            self.assertEqual(wrapper.call_method(mixed_case_path, "grade"), "UPPER")

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
