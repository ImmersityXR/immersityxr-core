//This script requires socket.io.dev.js

// Replace these with your own server's URLs.

// Tip: if you need to change this on-the-fly, you can edit this file without rebuilding. It's also possible to use the inspector to inspect the VR frame and call `window.RELAY_API_BASE_URL="<your-server-url>"`, if for some reason you need to do that in real time.

var RELAY_BASE_URL = "http://localhost:3000";

const pollInterval = 500; // how often to ask the relay server for stuff.

function getAllSessions (socket) {
    socket.emit("sessionsClientsSockets");
}

function getStateClientsSockets (socket) {
    socket.emit("stateClientsSockets");
}

function getAllSessionsWithDetails (socket) {
    socket.emit("sessionsWithDetails");
}

function getAllSockets (socket) {
    socket.emit("sockets");
}

function getSocketsAndRooms (socket) {
    socket.emit("socketsAndRooms");
}

function isEmpty (obj) {
    return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
}

window.onload = function () {
    
    var adminSocket = io(RELAY_BASE_URL + '/admin');
    
    localStorage.debug = 'socket.io-client:socket';

    adminSocket.on("adminInfo", function (info) {
        adminInfoEl.innerHTML = "Admin socket: " + info;
    });
    
    adminSocket.on("sessionsClientsSockets", function (sessions) {
        ////console.dir(sessions);
    
        allSessionsEl.innerHTML = '';

        if (sessions == null) {
            allSessionsEl.innerHTML = 'sessions was null';
            return;
        }

        var sessionsObj = JSON.parse(sessions);

        ////console.dir(sessionsObj);
        if (isEmpty(sessionsObj)) {
            allSessionsEl.innerHTML = 'None';
            return;
        }

        for (var session_id in sessionsObj) {
            allSessionsEl.innerHTML += session_id + '<br><ul>';
            for (var index in sessionsObj[session_id]) {
                allSessionsEl.innerHTML += '<li>' + sessionsObj[session_id][index] + '</li>';
            }
            
            allSessionsEl.innerHTML += '</ul>';
        }
    });

    adminSocket.on("sessionsWithDetails", function (sessions) {
        //console.dir(sessions);
    
        allSessionsEl.innerHTML = '...';

        if (sessions == null) {
            allSessionsEl.innerHTML = 'sessions was null';
            return;
        }

        if (sessions.length == 0) {
            allSessionsEl.innerHTML = 'None';
            return;
        }

        var sessionsObj = JSON.parse(sessions);
        
        allSessionsEl.innerHTML = JSON.stringify(sessionsObj, null, 10);
    });

    adminSocket.on("stateClientsSockets", function (sessions) {
        //console.dir(sessions);
    
        allSessionsEl.innerHTML = '...';

        if (sessions == null) {
            allSessionsEl.innerHTML = 'sessions was null';
            return;
        }

        if (sessions.length == 0) {
            allSessionsEl.innerHTML = 'None';
            return;
        }

        if (sessions == "") {
            allSessionsEl.innerHTML = 'sessions was empty string';
            return;
        }

        var sessionsObj = JSON.parse(sessions);
        
        allSessionsEl.innerHTML = JSON.stringify(sessionsObj, null, 10);
    });

    adminSocket.on("socketsAndRooms", function (socketsAndRooms) {
        if (socketsAndRooms == null) {
            allSocketsEl.innerHTML = 'sessions was null';
            return;
        }

        if (socketsAndRooms.length == 0) {
            allSocketsEl.innerHTML = 'None';
            return;
        }

        if (socketsAndRooms == "") {
            allSocketsEl.innerHTML = 'sessions was empty string';
            return;
        }

        var socketsAndRoomsObj = JSON.parse(socketsAndRooms);
        
        allSocketsEl.innerHTML = JSON.stringify(socketsAndRoomsObj, null, 10);
    });
    
    adminSocket.on("receiveAllSessions0", function (sessions) {
        //console.dir(sessions);
    
        allSessionsEl.innerHTML = '';

        if (sessions == null) {
            allSessionsEl.innerHTML = 'sessions was null';
            return;
        }

        var sessionsMap = new Map(JSON.parse(sessions));

        //console.dir(sessionsMap);
        if (sessionsMap.size == 0) {
            allSessionsEl.innerHTML = 'None';
            return;
        }
    
        sessionsMap.forEach((value, key, map) => {
            allSessionsEl.innerHTML += key + '\n';
        });
    });

    adminSocket.on("sockets", function (sockets) {
        //console.dir(sockets);
    
        allSocketsEl.innerHTML = '';

        if (sockets == null) {
            allSocketsEl.innerHTML = 'sockets was null';
            return;
        }

        if (sockets.length == 0) {
            allSocketsEl.innerHTML = 'None';
            return;
        }
    
        for (var key in sockets) {
            allSocketsEl.innerHTML += sockets[key] + '<br>';
        }
    });

    const adminInfoEl = document.querySelector("#adminInfo");
    const allSessionsEl = document.querySelector("#allSessions");
    const allSocketsEl = document.querySelector("#allSockets");

    const getAllSessionsEl = document.querySelector("#getAllSessions");
    const getAllSocketsEl = document.querySelector("#getAllSockets");
    
    allSessionsEl.innerHTML = '...';
    allSocketsEl.innerHTML = '...';

    getAllSessionsEl.addEventListener('click', function () {
        getStateClientsSockets(adminSocket);
    });

    getAllSocketsEl.addEventListener('click', function () {
        getSocketsAndRooms(adminSocket);
    });

    var intervalID = window.setInterval(function () {
        getStateClientsSockets(adminSocket);
        getSocketsAndRooms(adminSocket);
    }, pollInterval);
}
