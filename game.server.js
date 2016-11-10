
    var
        game_server = module.exports = { games : {}, game_count:0 },
        UUID        = require('node-uuid'),
        verbose     = true;

    global.window = global.document = global;

        //Importa librería del juego compartida.
    require('./game.core.js');

        //Simple forma de registro,
    game_server.log = function() {
        if(verbose) console.log.apply(this,arguments);
    };

    game_server.fake_latency = 0;
    game_server.local_time = 0;
    game_server._dt = new Date().getTime();
    game_server._dte = new Date().getTime();
        //una cola de mensajes local
    game_server.messages = [];

    setInterval(function(){
        game_server._dt = new Date().getTime() - game_server._dte;
        game_server._dte = new Date().getTime();
        game_server.local_time += game_server._dt/1000.0;
    }, 4);

    game_server.onMessage = function(client,message) {

        if(this.fake_latency && message.split('.')[0].substr(0,1) == 'i') {

                //almacena todos los mensajes de entrada
            game_server.messages.push({client:client, message:message});

            setTimeout(function(){
                if(game_server.messages.length) {
                    game_server._onMessage( game_server.messages[0].client, game_server.messages[0].message );
                    game_server.messages.splice(0,1);
                }
            }.bind(this), this.fake_latency);

        } else {
            game_server._onMessage(client, message);
        }
    };
    
    game_server._onMessage = function(client,message) {

            //COrta el mensaje en subcomponentes
        var message_parts = message.split('.');
            //El primero es siempre el tipo de mensaje
        var message_type = message_parts[0];

        var other_client =
            (client.game.player_host.userid == client.userid) ?
                client.game.player_client : client.game.player_host;

        if(message_type == 'i') {
                //El input handler la enviará
            this.onInput(client, message_parts);
        } else if(message_type == 'p') {
            client.send('s.p.' + message_parts[1]);
        } else if(message_type == 'c') {    //el cliente cambió su color
            if(other_client)
                other_client.send('s.c.' + message_parts[1]);
        } else if(message_type == 'l') {    //un cliente solicita simulación de lag
            this.fake_latency = parseFloat(message_parts[1]);
        }

    }; //game_server.onMessage

    game_server.onInput = function(client, parts) {
            //Los comandos de entrada se reciben como u-l,
            //así que se separan en comandos distintos,
            //y luego se actualizan los jugadores.
        var input_commands = parts[1].split('-');
        var input_time = parts[2].replace('-','.');
        var input_seq = parts[3];

            //el cliente debería estar en juego, entonces
            //podemos decirle al juego que maneje las entradas
        if(client && client.game && client.game.gamecore) {
            client.game.gamecore.handle_server_input(client, input_commands, input_time, input_seq);
        }

    }; //game_server.onInput

        //Define algunas funciones requeridas.
    game_server.createGame = function(player) {

            //Crea una nueva instancia de juego
        var thegame = {
                id : UUID(),                //genera nuevo id para el juego
                player_host:player,         //para saber quien inició el juego
                player_client:null,         
                player_count:1              
            };

            //Lo almacena en la lista de juegos
        this.games[ thegame.id ] = thegame;

        this.game_count++;

            //Crea una nueva instancia de game_core, esto ejecuta
            //el código del juego.
        thegame.gamecore = new game_core( thegame );
            //EMpieza a actualizar el game loop en el server
        thegame.gamecore.update( new Date().getTime() );

            //le dice al jugador que ahora es el host

        player.send('s.h.'+ String(thegame.gamecore.local_time).replace('.','-'));
        console.log('server host at  ' + thegame.gamecore.local_time);
        player.game = thegame;
        player.hosting = true;
        
        this.log('player ' + player.userid + ' created a game with id ' + player.game.id);

        return thegame;

    }; //game_server.createGame

        //solicita terminar un juego en proceso
    game_server.endGame = function(gameid, userid) {

        var thegame = this.games[gameid];

        if(thegame) {

                //detiene las actualizaciones inmediatamente
            thegame.gamecore.stop_update();

                //si el juego tiene 2 jugadores
            if(thegame.player_count > 1) {

                    //le indica a los jugadores que el juego se termina
                if(userid == thegame.player_host.userid) {

                        //el host abandonó. Intenta unirse a otro juego.
                    if(thegame.player_client) {
                            //les dice que el juego se terminó
                        thegame.player_client.send('s.e');
                            //busca crear otro juego
                        this.findGame(thegame.player_client);
                    }
                    
                } else {
                        //el otro jugador se fue, ahora soy host
                    if(thegame.player_host) {
                            //dice al cliente el juego terminó
                        thegame.player_host.send('s.e');
                            //no estoy más hosteando, el juego termina
                        thegame.player_host.hosting = false;
                            //busca crear otro juego
                        this.findGame(thegame.player_host);
                    }
                }
            }

            delete this.games[gameid];
            this.game_count--;

            this.log('game removed. there are now ' + this.game_count + ' games' );

        } else {
            this.log('that game was not found!');
        }

    }; //game_server.endGame

    game_server.startGame = function(game) {

            //el juego tiene 2 jugadores y quiere comenzar
            //el host sabe que está hosteando
            //le dice al cliente que se unió a un juego
        game.player_client.send('s.j.' + game.player_host.userid);
        game.player_client.game = game;

            //avisa que el juego está listo para empezar
            //los clientes resetean sus posiciones.
        game.player_client.send('s.r.'+ String(game.gamecore.local_time).replace('.','-'));
        game.player_host.send('s.r.'+ String(game.gamecore.local_time).replace('.','-'));
 
        game.active = true;

    }; //game_server.startGame

    game_server.findGame = function(player) {

        this.log('looking for a game. We have : ' + this.game_count);

            //hay un juego activo,
            //se fija si necesita otro jugador
        if(this.game_count) {
                
            var joined_a_game = false;

                //Checkea la lista de juegos
            for(var gameid in this.games) {
                    //solo importan mis propiedades
                if(!this.games.hasOwnProperty(gameid)) continue;
                    //obtiene el juego
                var game_instance = this.games[gameid];

                if(game_instance.player_count < 2) {

                        //alguien quiere unirse
                    joined_a_game = true;
                        //aumentar el número de jugadores y almacenar
                        //el jugador como cliente
                    game_instance.player_client = player;
                    game_instance.gamecore.players.other.instance = player;
                    game_instance.player_count++;

                        //empieza a correr el juego en el servidor,
                        //que le dirá a los
                    this.startGame(game_instance);

                } //if menos de dos jugadores
            } //para todos los juegos

                //si no me uni al juego,
                //debo crear uno
            if(!joined_a_game) {

                this.createGame(player);

            } //if no me uní al juego

        } else { //si no hay ningún juego

                //crea un juego
            this.createGame(player);
        }

    }; //game_server.findGame


