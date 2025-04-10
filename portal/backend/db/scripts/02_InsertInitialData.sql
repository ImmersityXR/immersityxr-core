INSERT INTO KP_Role (role_name)
VALUES ('admin'),
       ('instructor'),
       ('student');

INSERT INTO KP_Session_Type (type_name)
VALUES ('lab'),
       ('capture');

INSERT INTO KP_User (email, password, role_id, first_name, last_name)
VALUES ('admin@komodo.edu', SHA('password'), 1, 'Admin', 'Komodo');

INSERT INTO KP_Semester (year, period)
VALUES (2020, 'Spring'),
       (2020, 'Fall'),
       (2021, 'Spring');