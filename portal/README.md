# Immersity Portal

[Learn more about the Immersity Platform](https://github.com/ImmersityXR/immersity-docs)

## What is it?
Immersity Portal is a web service for instructors to deploy social virtual reality education apps. Instructors can easily deploy a classroom session, manage sessions and upload assets. Students can join in the classroom session to receive the instruction. This repo contains both backend and frontend. The frontend provides web views for users to interact, while the backend served as a API to support the necessary data requested from the frontend. 

1. [Development](#development)
2. [Deployment](#deployment)

_______________
<a name="development"></a>
### Development
#### Getting started
Prerequisite:
* [Node.js](https://nodejs.org/en/download/)
* vue/cli installed by `npm install -g @vue/cli-service-global`
* [MySQL workbench](https://dev.mysql.com/downloads/workbench/) (Recommend but not required)

Clone this repository
 ```bash
 git clone https://github.com/ImmersityXR/immersity-portal.git 
 cd immersity-portal/
 ```

This repo contains two parts: frontend and backend. You need to set up these two parts seperatively and run them on different port. 

#### Frontend
Visit [here](https://github.com/ImmersityXR/immersity-portal/tree/master/frontend) to get more details about the frontend.
#### Backend
Visit [here](https://github.com/ImmersityXR/immersity-portal/tree/master/backend) to get more details about the backend.

______________
<a name="deployment"></a>
### Deployment
The recommended Immersity deployment uses [Docker](https://www.docker.com/products/container-runtime) and docker-compose.  
