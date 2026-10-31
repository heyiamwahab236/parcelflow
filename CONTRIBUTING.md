# Contributing

Use Node.js 24 and Docker Compose. Run the unit tests, real-PostgreSQL integration tests and frontend build before opening a pull request; commands are in the README. Infrastructure changes also require Terraform formatting, validation and mock tests.

Keep shipment data synthetic. Never commit credentials, `.env`, Terraform state, real customer data or a rendered environment configuration. Add new SQL migration files rather than changing applied migrations. Preserve the public/private API boundary and include a behavioral test when changing it.

Describe actual validation and remaining limitations in the pull request. AI-generated code is welcome when reviewed and tested; tool-generated implementation is not evidence of a successful AWS deployment.
