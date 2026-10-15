# Auth testing playbook (OUTREACH.AI)

1. Mongo check: `db.users.findOne({role:"admin"})` → password_hash starts with `$2b$`; unique index on users.email.
2. Login: `curl -c c.txt -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@outreach.ai","password":"Admin@123"}'` → returns {user, token} and sets `access_token` cookie.
3. `curl -b c.txt $API/api/auth/me` or `-H "Authorization: Bearer <token>"` → same user.
4. 5 wrong passwords for the same ip+email → 429 for 15 minutes.
5. Disabled users (Admin Panel → Disable) get 403 on login and 401 on any API call.
6. Non-admin users get 403 on /api/admin/*.
