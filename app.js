
    var
        gameport        = process.env.PORT || 4004,

        io              = require('socket.io'),
        express         = require('express'),
        UUID            = require('node-uuid'),

        verbose         = false,
        http            = require('http'),
        app             = express(),
        server          = http.createServer(app);

/* Seteo del express server  */

//EL express server maneja el pase de información al navegador
//Además de enrutar a los usuarios donde necesitan ir
//y servirá cualquier archivo que el usuario solicite desde la raíz de su servidor web (desde donde se inicia el script)

        //el servidor escucha por conexiones
    server.listen(gameport)

        //loggea algo para saber que fue exitoso
    console.log('\t :: Express :: Listening on port ' + gameport );

        //Por default, se envía el path al index.html
    app.get( '/', function( req, res ){
        console.log('trying to load %s', __dirname + '/index.html');
        res.sendfile( '/index.html' , { root:__dirname });
    });


        //Este handler escuchará por peticiones de cualquier archivo de la raiz del servidor.

    app.get( '/*' , function( req, res, next ) {

            //Este es el archivo actual que fue solicitado
        var file = req.params[0];

            //Para el debugging, se puede rastrear qué archivos se solicitan
        if(verbose) console.log('\t :: Express :: file requested : ' + file);

            //Envía al cliente solicitante el archivo
        res.sendfile( __dirname + '/' + file );

    }); //app.get *


/* Seteo del Socket.IO server */

//Cuando el cliente solicita el archivo '/socket.io/', socket.io determina lo que el cliente necesita.
        
        //Crea una instancia de socket.io usando el express server
    var sio = io.listen(server);

        //Configura la conexión socket.io
    sio.configure(function (){

        sio.set('log level', 0);

        sio.set('authorization', function (handshakeData, callback) {
          callback(null, true); 
        });

    });

        //ENtra al código de juego del servidor. El server del juego soporta 
        //la conexion del cliente buscando por un juego, creando un juego,
        //abandonando un juego, uniendose a un juego y terminando un juego por abandono.
    game_server = require('./game.server.js');

        //Socket.io llama a esta función cuando un cliente se une
        //Se puede enviar al cliente buscando por un juego a jugar
        //al mismo tiempo que darle un id para mantener una lista de jugadores
    sio.sockets.on('connection', function (client) {
        
            //Genera una nueva UUID, se verá como
            //5b2ca132-64bd-4513-99da-90e838ca47d1
            //y la almacena en su socket/connection
        client.userid = UUID();

            //le dice al jugador que está conectado, dandole su id
        client.emit('onconnected', { id: client.userid } );

            //ahora se le puede encontrar un juego para que juegue
            //si no existe un juego, crea uno y espera
        game_server.findGame(client);

            //Información útil cuando alguien se conecta
        console.log('\t socket.io:: player ' + client.userid + ' connected');
        
            //Nos interesa manejar los mensajes que envía el cliente.
            //envía mensajes aqui, y los enviamos al game_server para manejarlos.
        client.on('message', function(m) {

            game_server.onMessage(client, m);

        }); //client.on message

            //Cuando este cliente se desconecta, lo informamos al servidor
            //para que lo remueva del juego e informarle al otro jugador.
        client.on('disconnect', function () {

                //información útil cuando alguien se desconecta
            console.log('\t socket.io:: client disconnected ' + client.userid + ' ' + client.game_id);
            
                //si el cliente estaba en juego, setea por game_server.findGame,
                //se le dice al game server que actualice el estado.
            if(client.game && client.game.id) {

                //el jugador abandonando el juego, bedería destruir el jeugo
                game_server.endGame(client.game.id, client.userid);

            } //client.game_id

        }); //client.on disconnect
     
    }); //sio.sockets.on connection
