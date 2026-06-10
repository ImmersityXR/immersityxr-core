INSERT INTO KP_Role (role_name)
VALUES ('admin'),
       ('instructor'),
       ('student');

INSERT INTO KP_Session_Type (type_name)
VALUES ('lab'),
       ('capture');

-- The initial admin user is created by entrypoint.sh from the ADMIN_EMAIL
-- and ADMIN_PASSWORD environment variables (no hardcoded default password).

INSERT INTO KP_Semester (year, period)
VALUES (2020, 'Spring'),
       (2020, 'Fall'),
       (2021, 'Spring');