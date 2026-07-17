# Immersity Portal - Backend

[Learn more about the Immersity Platform](../../docs/ARCHITECTURE.md)

## What is it?
As a part of Immersity Portal, the backend served as a API to support the necessary data requested from the frontend and interacted with database to query the data. The backend is based on Node.js/Express. 

1. [Development](#development)
2. [Test](#test)
3. [Deployment](#deployment)

_______________
<a name="development"></a>
### Development
#### Getting started
Prerequisite:
* [Node.js](https://nodejs.org/en/download/)
* [MySQL workbench](https://dev.mysql.com/downloads/workbench/) (Recommend but not required)

1. Clone this repository
 ```bash
 git clone https://github.com/ImmersityXR/immersityxr-core.git immersity
 cd immersity/portal/backend
 ```
2. Install dependencies
```bash
npm install
```
3. Run the server
```bash
node index.js
```

______________
<a name="test"></a>
### Test
The recommended Immersity test users `Postman`, more details can see [here](https://learning.postman.com/docs/getting-started/introduction/).

______________
<a name="deployment"></a>
### Deployment
The recommended Immersity deployment uses [Docker](https://www.docker.com/products/container-runtime) and docker-compose.  

# Azure App Service
## Persistence
For the database to persist between container restarts, two things must be true:

1. The database must be written to a subdirectory of `/home`, and
2. The environment variable `WEBSITES_ENABLE_APP_SERVICE_STORAGE` must be true.