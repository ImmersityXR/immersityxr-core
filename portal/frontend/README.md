# Immersity Portal - Frontend

[Learn more about the Immersity Platform](../../docs/ARCHITECTURE.md)

## What is it?
As a part of Immersity Portal, the frontend provides web views for users to interact, it includes several web pages such as login page, dashboard page, course detail page, etc. The frontend is based on `Vue` framework.

1. [Development](#development)
2. [Deployment](#deployment)

_______________
<a name="development"></a>
### Development
#### Getting started
Prerequisite:
* [Node.js](https://nodejs.org/en/download/)
* [vue/cli] Installed by `npm install -g @vue/cli-service-global`

1. Clone this repository
 ```bash
 git clone https://github.com/ImmersityXR/immersity-core.git immersity
 cd immersity/portal/frontend
 ```
2. Install dependencies
```bash
npm install
```
3. Run the application
* Run in the dev mode
```bash
npm run dev
```
* Run in the serve mode
```bash
npm run serve
```

______________
<a name="deployment"></a>
### Deployment
The recommended Immersity deployment uses [Docker](https://www.docker.com/products/container-runtime) and docker-compose.  