"""Keep the discovery response aligned with the application's auth routes."""

import unittest

from app.main import api_info, app


class APIInfoTest(unittest.IsolatedAsyncioTestCase):
    async def test_auth_discovery_matches_registered_routes(self) -> None:
        info = await api_info()
        registered = {
            f"{method.upper()} {path}"
            for path, operations in app.openapi()["paths"].items()
            if path.startswith("/auth/")
            for method in operations
            if method in {"get", "post", "put", "patch", "delete", "options", "head"}
        }
        self.assertTrue(registered)
        self.assertEqual(set(info["endpoints"]["auth"]), registered)


if __name__ == "__main__":
    unittest.main()
