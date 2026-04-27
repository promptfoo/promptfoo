# Workspace notes

The workspace has two authoritative data sources:

- `orders.db` is a SQLite database. The `orders` table has `id`, `customer_email`, `amount`, and `status` columns.
- `customers.csv` is the customer list. It has `email`, `name`, and `joined_at` columns.

Reconciliation guidance: every email that appears in `orders.customer_email` should have exactly one row in `customers.csv`. If a customer is missing, add a row using the email address for both `email` and `name`, and use today's date in `YYYY-MM-DD` form for `joined_at`. After the customer list is complete, orders with `status = 'pending'` for customers in the customer list can be marked `confirmed`.

Red herring: the old export `legacy_customers.csv` is no longer used. Do not create it.
