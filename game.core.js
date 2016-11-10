

var frame_time = 60/1000; // el juego local se ejecuta a 16ms/ 60hz
if('undefined' != typeof(global)) frame_time = 45; //en servidor se ejecuta a 45ms, 22hz

( function () {

    var lastTime = 0;
    var vendors = [ 'ms', 'moz', 'webkit', 'o' ];

    for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++ x ) {
        window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
        window.cancelAnimationFrame = window[ vendors[ x ] + 'CancelAnimationFrame' ] || window[ vendors[ x ] + 'CancelRequestAnimationFrame' ];
    }

    if ( !window.requestAnimationFrame ) {
        window.requestAnimationFrame = function ( callback, element ) {
            var currTime = Date.now(), timeToCall = Math.max( 0, frame_time - ( currTime - lastTime ) );
            var id = window.setTimeout( function() { callback( currTime + timeToCall ); }, timeToCall );
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if ( !window.cancelAnimationFrame ) {
        window.cancelAnimationFrame = function ( id ) { clearTimeout( id ); };
    }

}() );

        //Clase principal del juego. Se crea tanto en servidor
        //como en cliente. EL servidor crea uno para 
        //cada juego hosteado, el cliente crea una para 
        //si mismo para poder jugar
        

/* Clase game_core  */

    var game_core = function(game_instance){

            //Almacena la instacia, si existe
        this.instance = game_instance;
            //Almacena un flag, si soy el servidor
        this.server = this.instance !== undefined;

            //Utilizado para colisiones, etc
        this.world = {
            width : 720,
            height : 480
        };

            //Se crea el jugador, pasandole 
            //el juego que se está corriendo 
        if(this.server) {

            this.players = {
                self : new game_player(this,this.instance.player_host),
                other : new game_player(this,this.instance.player_client)
            };

           this.players.self.pos = {x:20,y:20};

        } else {

            this.players = {
                self : new game_player(this),
                other : new game_player(this)
            };

                //Debugging ghosts, ayuda a visualizar
            this.ghosts = {
                    //Posición del ghost en el servidor 
                server_pos_self : new game_player(this),
                    //La posición del servidor del otro jugador recibida
                server_pos_other : new game_player(this),
                    //La posición de destino del ghost del otro jugador (el lerp)
                pos_other : new game_player(this)
            };

            this.ghosts.pos_other.state = 'dest_pos';

            this.ghosts.pos_other.info_color = 'rgba(255,255,255,0.1)';

            this.ghosts.server_pos_self.info_color = 'rgba(255,255,255,0.2)';
            this.ghosts.server_pos_other.info_color = 'rgba(255,255,255,0.2)';

            this.ghosts.server_pos_self.state = 'server_pos';
            this.ghosts.server_pos_other.state = 'server_pos';

            this.ghosts.server_pos_self.pos = { x:20, y:20 };
            this.ghosts.pos_other.pos = { x:500, y:200 };
            this.ghosts.server_pos_other.pos = { x:500, y:200 };
        }

            //Velocidad a la cual se mueve el cliente
        this.playerspeed = 120;

            //Valores fisicos de movimiento del juego
        this._pdt = 0.0001;                 //Actualización delta de tiempo
        this._pdte = new Date().getTime();  //Actualización delta de tiempo anterior
            //Cronómetro local para presición en servidor y cliente
        this.local_time = 0.016;            //Tiempo local
        this._dt = new Date().getTime();    //Delta de tiempo local
        this._dte = new Date().getTime();   //Último tiempo de frame local

            //Inicia un loop físico
            //Esto ocurre en una frecuencia estipulada
        this.create_physics_simulation();

            //Inicia un cronómetro más rápido para contar tiempo
        this.create_timer();

            //Inicialización específica del cliente
        if(!this.server) {
            
                //Crea un keyboard handler
            this.keyboard = new THREEx.KeyboardState();

                //Crea la configuración por defecto
            this.client_create_configuration();

                //Lista de las últimas actualizaciones del servidor
            this.server_updates = [];

                //Conexion con el servidor socket.io
            this.client_connect_to_server();

                //Ping al servidor para determinar tiempo de latencia
            this.client_create_ping_timer();

                //Setea los colores
            this.color = localStorage.getItem('color') || '#cc8822' ;
            localStorage.setItem('color', this.color);
            this.players.self.color = this.color;

                //Hacer solo si se necesita
            if(String(window.location).indexOf('debug') != -1) {
                this.client_create_debug_gui();
            }

        } else { //if !server

            this.server_time = 0;
            this.laststate = {};

        }

    }; //game_core.constructor

//server side, setea la clase "game_core" de tipo global, para usarla en cualquier lado.
if( 'undefined' != typeof global ) {
    module.exports = global.game_core = game_core;
}

/*
    Funciones que ayudan a la implementación del juego.

*/

    // (4.22208334636).fixed(n) devuelve un valor de fixed point para n posiciones, por default n = 3
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };
    //copia un vector 2d como objeto de uno al otro
game_core.prototype.pos = function(a) { return {x:a.x,y:a.y}; };
    //Suma un vector 2d con otro y devuelve el vector resultado.
game_core.prototype.v_add = function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; };
    //Resta un vector 2d con otro y devuelve el vector resultado.
game_core.prototype.v_sub = function(a,b) { return { x:(a.x-b.x).fixed(),y:(a.y-b.y).fixed() }; };
    //Suma un vector 2d con un valor escalar y devuelve el vector resultado.
game_core.prototype.v_mul_scalar = function(a,b) { return {x: (a.x*b).fixed() , y:(a.y*b).fixed() }; };
    //Para el server, se cancela el setTimeout que crea el polyfill.
game_core.prototype.stop_update = function() {  window.cancelAnimationFrame( this.updateid );  };
    //Interpolación lineal simple.
game_core.prototype.lerp = function(p, n, t) { var _t = Number(t); _t = (Math.max(0, Math.min(1, _t))).fixed(); return (p + _t * (n - p)).fixed(); };
    //Interpolación lineal simple entre dos vectores.
game_core.prototype.v_lerp = function(v,tv,t) { return { x: this.lerp(v.x, tv.x, t), y:this.lerp(v.y, tv.y, t) }; };

/*
    La clase del jugador

        Una clase para mantener el estado de un jugador en pantalla,
        además de mostrar ese estado cuando se requiera.
*/

    var game_player = function( game_instance, player_instance ) {

            //Almacena la instancia, si existe
        this.instance = player_instance;
        this.game = game_instance;

            //Setea valores iniciales para el estado de información
        this.pos = { x:0, y:0 };
        this.size = { x:16, y:16, hx:8, hy:8 };
        this.state = 'not-connected';
        this.color = 'rgba(255,255,255,0.1)';
        this.info_color = 'rgba(255,255,255,0.1)';
        this.id = '';

            //Se utilizan para mover el jugador
        this.old_state = {pos:{x:0,y:0}};
        this.cur_state = {pos:{x:0,y:0}};
        this.state_time = new Date().getTime();

            //Historia local de entradas
        this.inputs = [];

            //El mundo al que está confinado el juego
        this.pos_limits = {
            x_min: this.size.hx,
            x_max: this.game.world.width - this.size.hx,
            y_min: this.size.hy,
            y_max: this.game.world.height - this.size.hy
        };

            //El 'host' del juego es creado con una instancia de jugador
            //el server ya sabe quienes son. Si el server inicia un juego
            //con solo un host, el otro jugador entra en el 'else' de abajo.
        if(player_instance) {
            this.pos = { x:20, y:20 };
        } else {
            this.pos = { x:500, y:200 };
        }

    }; //game_player.constructor
  
    game_player.prototype.draw = function(){

            //Setea el color para este jugador
        game.ctx.fillStyle = this.color;

            //Dibuja el rectángulo
        game.ctx.fillRect(this.pos.x - this.size.hx, this.pos.y - this.size.hy, this.size.x, this.size.y);

            //Dibuja el update del estado
        game.ctx.fillStyle = this.info_color;
        game.ctx.fillText(this.state, this.pos.x+10, this.pos.y + 4);
    
    }; //game_player.draw

/*

 Funciones en común
 
    Estas funciones son compartidas entre el cliente y servidor, y son genéricas
    para el estado del juego. Las funciones del cliente son client_* y las funciones
    del servidor son server_* entonces, estas no tienen prefijos.

*/

    //Update principal del loop
game_core.prototype.update = function(t) {
    
        //Manejo del tiempo delta
    this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016;

        //Almacena el último tiempo del frame
    this.lastframetime = t;

        //Actualiza las especificaciones del juego
    if(!this.server) {
        this.client_update();
    } else {
        this.server_update();
    }

        //programa el próximo update
    this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );

}; //game_core.update


/*
    COmpartido entre server y cliente.
    'item es siempre del tipo game_player.
*/
game_core.prototype.check_collision = function( item ) {

        //pared izquierda.
    if(item.pos.x <= item.pos_limits.x_min) {
        item.pos.x = item.pos_limits.x_min;
    }

        //pared derecha
    if(item.pos.x >= item.pos_limits.x_max ) {
        item.pos.x = item.pos_limits.x_max;
    }
    
        //pared superior.
    if(item.pos.y <= item.pos_limits.y_min) {
        item.pos.y = item.pos_limits.y_min;
    }

        //pared inferior
    if(item.pos.y >= item.pos_limits.y_max ) {
        item.pos.y = item.pos_limits.y_max;
    }

        //El fixed point ayuda a ser más determinístico
    item.pos.x = item.pos.x.fixed(4);
    item.pos.y = item.pos.y.fixed(4);
    
}; //game_core.check_collision


game_core.prototype.process_input = function( player ) {

    //Es poible haber recibido varias entradas
    //así que se procesan todas
    var x_dir = 0;
    var y_dir = 0;
    var ic = player.inputs.length;
    if(ic) {
        for(var j = 0; j < ic; ++j) {
                //no procesar una vez que ya se simularon localmente
            if(player.inputs[j].seq <= player.last_input_seq) continue;

            var input = player.inputs[j].inputs;
            var c = input.length;
            for(var i = 0; i < c; ++i) {
                var key = input[i];
                if(key == 'l') {
                    x_dir -= 1;
                }
                if(key == 'r') {
                    x_dir += 1;
                }
                if(key == 'd') {
                    y_dir += 1;
                }
                if(key == 'u') {
                    y_dir -= 1;
                }
            } //para todos los valores de entrada

        } //para cada comando de entrada
    } //si se tienen entradas

        //ahora se tiene un vector de dirección, se le aplica la misma física que al cliente
    var resulting_vector = this.physics_movement_vector_from_direction(x_dir,y_dir);
    if(player.inputs.length) {
        //ahora se puede borrar el array, ya que todo fue procesado

        player.last_input_time = player.inputs[ic-1].time;
        player.last_input_seq = player.inputs[ic-1].seq;
    }

    return resulting_vector;

}; //game_core.process_input



game_core.prototype.physics_movement_vector_from_direction = function(x,y) {

        //Debe ser fixed step, en la sincronización física de velocidad.
    return {
        x : (x * (this.playerspeed * 0.015)).fixed(3),
        y : (y * (this.playerspeed * 0.015)).fixed(3)
    };

}; //game_core.physics_movement_vector_from_direction

game_core.prototype.update_physics = function() {

    if(this.server) {
        this.server_update_physics();
    } else {
        this.client_update_physics();
    }

}; //game_core.prototype.update_physics

/*

Funciones de server side
 
    Estas funciones son específicas del server side únicamente,
    y comenzarán normalmente con server_*

*/

    //Actualiza a 15ms , simula el estado del mundo.
game_core.prototype.server_update_physics = function() {

        //Soporta jugador 1.
    this.players.self.old_state.pos = this.pos( this.players.self.pos );
    var new_dir = this.process_input(this.players.self);
    this.players.self.pos = this.v_add( this.players.self.old_state.pos, new_dir );

        //Soporta jugador 2.
    this.players.other.old_state.pos = this.pos( this.players.other.pos );
    var other_new_dir = this.process_input(this.players.other);
    this.players.other.pos = this.v_add( this.players.other.old_state.pos, other_new_dir);

        //Mantiene las posiciones físicas en el mundo.
    this.check_collision( this.players.self );
    this.check_collision( this.players.other );

    this.players.self.inputs = []; //se borra el buffer de entradas
    this.players.other.inputs = []; //se borra el buffer de entradas

}; //game_core.server_update_physics

    //Se asegura que las cosas se ejecuten correctamente y notifica al cliente
    //sobre cambios en el lado del servidor.
game_core.prototype.server_update = function(){

        //Actualiza el estado de reloj local para coincidir en el timer
    this.server_time = this.local_time;

        //Guarda imagen del estado actual, para actualizar los clientes
    this.laststate = {
        hp  : this.players.self.pos,                //'host position', posición del creador del juego.
        cp  : this.players.other.pos,               //'client position', la posición de la persona que se unió.
        his : this.players.self.last_input_seq,     //'host input sequence', la última entrada que se procesó del host.
        cis : this.players.other.last_input_seq,    //'client input sequence', la última entrada que se procesó dle cliente.
        t   : this.server_time                      // el tiempo local actual en el servidor.
    };

        //Envía la imagen al jugador 'host'
    if(this.players.self.instance) {
        this.players.self.instance.emit( 'onserverupdate', this.laststate );
    }

        //Envía la imagen al jugador 'client' 
    if(this.players.other.instance) {
        this.players.other.instance.emit( 'onserverupdate', this.laststate );
    }

}; //game_core.server_update


game_core.prototype.handle_server_input = function(client, input, input_time, input_seq) {

        //Busca a qué cliente se refiere uno de los dos
    var player_client =
        (client.userid == this.players.self.instance.userid) ?
            this.players.self : this.players.other;

        //Almacena la entrada en la instancia del jugador para procesarlo en el loop físico.
   player_client.inputs.push({inputs:input, time:input_time, seq:input_seq});

}; //game_core.handle_server_input


/*

 Funciones de client side 

    estas funciones son específicas para el lado del cliente únicamente,
    y comienzan con client_* to.

*/

game_core.prototype.client_handle_input = function(){

    //if(this.lit > this.local_time) return;
    //this.lit = this.local_time+0.5; //delay de un segundo

        //Esto toma una entrada del cliente y la guarda,
        //La envía al servidor inmediatamente
        //y es procesada. Además asigna a cada entrada un número de secuencia.

    var x_dir = 0;
    var y_dir = 0;
    var input = [];
    this.client_has_input = false;

    if( this.keyboard.pressed('A') ||
        this.keyboard.pressed('left')) {

            x_dir = -1;
            input.push('l');

        } //izquierda

    if( this.keyboard.pressed('D') ||
        this.keyboard.pressed('right')) {

            x_dir = 1;
            input.push('r');

        } //derecha

    if( this.keyboard.pressed('S') ||
        this.keyboard.pressed('down')) {

            y_dir = 1;
            input.push('d');

        } //abajo

    if( this.keyboard.pressed('W') ||
        this.keyboard.pressed('up')) {

            y_dir = -1;
            input.push('u');

        } //arriba

    if(input.length) {

            //actualiza en qué secuencia se encuentra
        this.input_seq += 1;

            //Amlacena el estado de entrada como una imagen de lo que pasó.
        this.players.self.inputs.push({
            inputs : input,
            time : this.local_time.fixed(3),
            seq : this.input_seq
        });

            //Envía el paquete de información al server.
            //Los paquetes de entrada son identificados con una 'i' en el frente.
        var server_packet = 'i.';
            server_packet += input.join('-') + '.';
            server_packet += this.local_time.toFixed(3).replace('.','-') + '.';
            server_packet += this.input_seq;

        this.socket.send(  server_packet  );

            //Devuelve la dirección si necesita
        return this.physics_movement_vector_from_direction( x_dir, y_dir );

    } else {

        return {x:0,y:0};

    }

}; //game_core.client_handle_input

game_core.prototype.client_process_net_prediction_correction = function() {

        //Sin actualizaciones
    if(!this.server_updates.length) return;

        //La actualización de servidor más reciente
    var latest_server_data = this.server_updates[this.server_updates.length-1];

        //La última posición del servidor
    var my_server_pos = this.players.self.host ? latest_server_data.hp : latest_server_data.cp;

        //Actualiza el bloque de posición del debug server.
    this.ghosts.server_pos_self.pos = this.pos(my_server_pos);

            //Aquí se maneja la entrada local,
            //corrigiendola con el servidor y corrigiendo diferencias

        var my_last_input_on_server = this.players.self.host ? latest_server_data.his : latest_server_data.cis;
        if(my_last_input_on_server) {
                //El último índice de secuencia de entrada en la lista de entrada local.
            var lastinputseq_index = -1;
                //Encuentra la entrada en la lista, y la almacena en el índice
            for(var i = 0; i < this.players.self.inputs.length; ++i) {
                if(this.players.self.inputs[i].seq == my_last_input_on_server) {
                    lastinputseq_index = i;
                    break;
                }
            }

                //Ahora se recorta la lista de las actualizaciones que ya se han procesado
            if(lastinputseq_index != -1) {
                //ahora se ha recibido un reconocimiento del servidor de que sus entradas aquí han sido aceptadas 
                //y qué podemos predecir desde esta posición conocida en su lugar.

                    //remueve el resto de las entradas que fueron confirmadas en el servidor
                var number_to_clear = Math.abs(lastinputseq_index - (-1));
                this.players.self.inputs.splice(0, number_to_clear);
                    //El jugador está ahora posicionado en la nueva posición del servidor.
                this.players.self.cur_state.pos = this.pos(my_server_pos);
                this.players.self.last_input_seq = lastinputseq_index;
                    //Ahora se procesan todas las entradas que se tienen localmente que
                    //el servidor aún no ha confirmado.
                this.client_update_physics();
                this.client_update_local_position();

            } // if(lastinputseq_index != -1)
        } //if my_last_input_on_server

}; //game_core.client_process_net_prediction_correction

game_core.prototype.client_process_net_updates = function() {

        //Sin actualizaciones.
    if(!this.server_updates.length) return;

    //Primero : encuentra la posición en las actualizaciones, en la linea de tiempo.
    //Se llama a current_time, luego se encuentra past_pos y target_pos usando esto,
    //buscando en el array de server_updates por current_time entre 2 unidades de tiempo.
    //Luego :  otra posición de jugador = lerp ( past_pos, target_pos, current_time );

        //Encuentra la posición en la linea de tiempo de actualizaciones almacenadas.
    var current_time = this.client_time;
    var count = this.server_updates.length-1;
    var target = null;
    var previous = null;

        //Se busca la actualización más vieja, desde que las más nuevas
        //están al final (list.length-1 for example).
    for(var i = 0; i < count; ++i) {

        var point = this.server_updates[i];
        var next_point = this.server_updates[i+1];

            //Compare our point in time with the server times we have
        if(current_time > point.t && current_time < next_point.t) {
            target = next_point;
            previous = point;
            break;
        }
    }

        //Si no hay objetivo, se almacena la última posición 
        //del servidor conocido y se mueve a ella.
    if(!target) {
        target = this.server_updates[0];
        previous = this.server_updates[0];
    }

        //Ahora hay un objetivo y posición previa,
        //se interpola calculando que tan lejos se encontraba.

     if(target && previous) {

        this.target_time = target.t;

        var difference = this.target_time - current_time;
        var max_difference = (target.t - previous.t).fixed(3);
        var time_point = (difference/max_difference).fixed(3);

            //Evita errores por dividir por 0
        if( isNaN(time_point) ) time_point = 0;
        if(time_point == -Infinity) time_point = 0;
        if(time_point == Infinity) time_point = 0;

            //La actualización del servidor más reciente.
        var latest_server_data = this.server_updates[ this.server_updates.length-1 ];

            //Las posiciones exactas del servidor en este momento, pero solo para el ghost.
        var other_server_pos = this.players.self.host ? latest_server_data.cp : latest_server_data.hp;

            //Las otras posiciones de los jugadores en la línea de tiempo.
        var other_target_pos = this.players.self.host ? target.cp : target.hp;
        var other_past_pos = this.players.self.host ? previous.cp : previous.hp;

            //actualiza el bloque de destino
            //con el objetivo del punto anterior del buffer de server_updates
        this.ghosts.server_pos_other.pos = this.pos(other_server_pos);
        this.ghosts.pos_other.pos = this.v_lerp(other_past_pos, other_target_pos, time_point);

        if(this.client_smoothing) {
            this.players.other.pos = this.v_lerp( this.players.other.pos, this.ghosts.pos_other.pos, this._pdt*this.client_smooth);
        } else {
            this.players.other.pos = this.pos(this.ghosts.pos_other.pos);
        }

            //Si no se predice ningun movimiento del cliente,se mantiene la posicion local del jugador
        if(!this.client_predict && !this.naive_approach) {

                //Estas son las posiciones exactas del servidor en este momento, pero solo para el ghost
            var my_server_pos = this.players.self.host ? latest_server_data.hp : latest_server_data.cp;

                //La otra posición del jugador en la linea de tiempo
            var my_target_pos = this.players.self.host ? target.hp : target.cp;
            var my_past_pos = this.players.self.host ? previous.hp : previous.cp;

                //Ajusta el ghost a la nueva posición del servidor
            this.ghosts.server_pos_self.pos = this.pos(my_server_pos);
            var local_target = this.v_lerp(my_past_pos, my_target_pos, time_point);

                //Sigue la posición de destino
            if(this.client_smoothing) {
                this.players.self.pos = this.v_lerp( this.players.self.pos, local_target, this._pdt*this.client_smooth);
            } else {
                this.players.self.pos = this.pos( local_target );
            }
        }

    } //if target && previous

}; //game_core.client_process_net_updates

game_core.prototype.client_onserverupdate_recieved = function(data){

            //Uno de los jugadores está "hosteando" el juego
            //el otro se une como cliente, entonces se nombran este host y cliente para asegurarse
            //que las posiciones que se obtienen del servidor son mapeadas en las variables locales correctas.
        var player_host = this.players.self.host ?  this.players.self : this.players.other;
        var player_client = this.players.self.host ?  this.players.other : this.players.self;
        var this_player = this.players.self;
        
            //Almacena el tiempo del servidor (esto es compensado por la latencia en la red, por el tiempo que se obtiene)
        this.server_time = data.t;
            //Actualizar el tiempo de desplazamiento local desde la última actualización del servidor.
        this.client_time = this.server_time - (this.net_offset/1000);

        if(this.naive_approach) {

            if(data.hp) {
                player_host.pos = this.pos(data.hp);
            }

            if(data.cp) {
                player_client.pos = this.pos(data.cp);
            }

        } else {

                //Toma los datos del servidor
                //y luego corre la linea de tiempo
                //vuelve al jugador con un pequeño dilay (net_offset), permitiendo
                //interpolación entre los puntos.
            this.server_updates.push(data);

                //Se limita el buffer a segundos
                //60fps*buffer segundos = numero de samples
            if(this.server_updates.length >= ( 60*this.buffer_size )) {
                this.server_updates.splice(0,1);
            }

                //Puede verse cuándo ocurrió el último momento del que sabemos.
                //Si client_time se atrasa debido a la latencia, se produce toma una imagen
                //al último momento. Puede ser por mala conexión.
                //Si esto ocurre, puede ser mejor abandonar el juego luego de un período de tiempo.
            this.oldest_tick = this.server_updates[0].t;

                //Mantiene las últimas posiciones del servidor.
                //y se asegura de corregir las predicciones locales, el servidor tiene la última decision.
            this.client_process_net_prediction_correction();
            
        } //non naive

}; //game_core.client_onserverupdate_recieved

game_core.prototype.client_update_local_position = function(){

 if(this.client_predict) {

            //Trabaja con el tiempo que tenemos desde que actualizamos el estado
        var t = (this.local_time - this.players.self.state_time) / this._pdt;

            //Luego almacena los estados
        var old_state = this.players.self.old_state.pos;
        var current_state = this.players.self.cur_state.pos;

            //Se asegura que la posición visual coincida con el estado almacenado
        //this.players.self.pos = this.v_add( old_state, this.v_mul_scalar( this.v_sub(current_state,old_state), t )  );
        this.players.self.pos = current_state;
        
            //Maneja colisiones en el cliente 
        this.check_collision( this.players.self );

    }  //if(this.client_predict)

}; //game_core.prototype.client_update_local_position

game_core.prototype.client_update_physics = function() {

        //Recupera la nueva direccion de la entrada del buffer,
        //y lo aplica al estado así se puede pasar al estado visual.

    if(this.client_predict) {

        this.players.self.old_state.pos = this.pos( this.players.self.cur_state.pos );
        var nd = this.process_input(this.players.self);
        this.players.self.cur_state.pos = this.v_add( this.players.self.old_state.pos, nd);
        this.players.self.state_time = this.local_time;

    }

}; //game_core.client_update_physics

game_core.prototype.client_update = function() {

        //Limpia la pantalla
    this.ctx.clearRect(0,0,720,480);

        //muestra ayuda/información si es requerida
    this.client_draw_info();

        //Captura entradas del jugador
    this.client_handle_input();

        //actualiza la posición actual del cliente en la pantalla
    if( !this.naive_approach ) {
        this.client_process_net_updates();
    }

        //Ahora deben estar actualizados, se puede mostrar la entidad.
    this.players.other.draw();

        //Cuando se hace prediccion del lado del cliente, se cambia la posición
        //entre los frame utilizando los estados de las entradas locales almacenadas.
    this.client_update_local_position();

        //Y luego se muestran
    this.players.self.draw();

    if(this.show_dest_pos && !this.naive_approach) {
        this.ghosts.pos_other.draw();
    }

    if(this.show_server_pos && !this.naive_approach) {
        this.ghosts.server_pos_self.draw();
        this.ghosts.server_pos_other.draw();
    }

    this.client_refresh_fps();

}; //game_core.update_client

game_core.prototype.create_timer = function(){
    setInterval(function(){
        this._dt = new Date().getTime() - this._dte;
        this._dte = new Date().getTime();
        this.local_time += this._dt/1000.0;
    }.bind(this), 4);
}

game_core.prototype.create_physics_simulation = function() {

    setInterval(function(){
        this._pdt = (new Date().getTime() - this._pdte)/1000.0;
        this._pdte = new Date().getTime();
        this.update_physics();
    }.bind(this), 15);

}; //game_core.client_create_physics_simulation


game_core.prototype.client_create_ping_timer = function() {

        //Setea tiempo de ping en 1 segundo, para mentener el ping/latencia entre
        //cliente y servidor y calcular cómo está la conexion.

    setInterval(function(){

        this.last_ping_time = new Date().getTime() - this.fake_lag;
        this.socket.send('p.' + (this.last_ping_time) );

    }.bind(this), 1000);
    
}; //game_core.client_create_ping_timer


game_core.prototype.client_create_configuration = function() {

    this.show_help = false;             //Si muestra o no el texto de ayuda
    this.naive_approach = false;        //utilizar o no el enfoque naive
    this.show_server_pos = false;       //si muestra o no la posición del servidor
    this.show_dest_pos = false;         //si muestra o no el objetivo de la interpolación
    this.client_predict = true;         //si el cliente está o no prediciendo una entrada
    this.input_seq = 0;                 //cuando predice entradas del cliente, se almacena la última entrada como número de secuencia
    this.client_smoothing = true;       //Whether or not the client side prediction tries to smooth things out
    this.client_smooth = 25;            //cantidad de movimiento para aplicar al destino del cliente

    this.net_latency = 0.001;           //Latencia entre el cliente y el servidor (ping/2)
    this.net_ping = 0.001;              //El tiempo de ida y vuelta de aquí al servidor
    this.last_ping_time = 0.001;        //El último momento en que se envió un ping
    this.fake_lag = 0;                  //Aplica solo a la entrada del cliente y si hay lag.
    this.fake_lag_time = 0;

    this.net_offset = 100;              //100 ms de latencia entre servidor y cliente interpolado porotro cliente
    this.buffer_size = 2;               //El tamaño de la historia del servidor.
    this.target_time = 0.01;            //el tiempo en que se quiere estar en la linea de tiempo del servidor
    this.oldest_tick = 0.01;            //el último momento de tiempo disponible en el buffer.

    this.client_time = 0.01;            //El reloj local basado en el tiempo del servidor - client interpolation(net_offset).
    this.server_time = 0.01;            //El último momento de tiempo en el cual el servidor se reportó
    
    this.dt = 0.016;                    //El tiempo que tardó en ejecutarse el último frame
    this.fps = 0;                       //El fps instantáneo actual (1/this.dt)
    this.fps_avg_count = 0;             //El número de muestras que se tomaron para fps_avg
    this.fps_avg = 0;                   //El promedio de fps actual mostrado en la IU de depuración
    this.fps_avg_acc = 0;               //La acumulación de las últimas muestras de fps del contador promedio

    this.lit = 0;
    this.llt = new Date().getTime();

};//game_core.client_create_configuration

game_core.prototype.client_create_debug_gui = function() {

    this.gui = new dat.GUI();

    var _playersettings = this.gui.addFolder('Your settings');

        this.colorcontrol = _playersettings.addColor(this, 'color');

            //el servidor informa cuando se cambia el color
        this.colorcontrol.onChange(function(value) {
            this.players.self.color = value;
            localStorage.setItem('color', value);
            this.socket.send('c.' + value);
        }.bind(this));

        _playersettings.open();

    var _othersettings = this.gui.addFolder('Methods');

        _othersettings.add(this, 'naive_approach').listen();
        _othersettings.add(this, 'client_smoothing').listen();
        _othersettings.add(this, 'client_smooth').listen();
        _othersettings.add(this, 'client_predict').listen();

    var _debugsettings = this.gui.addFolder('Debug view');
        
        _debugsettings.add(this, 'show_help').listen();
        _debugsettings.add(this, 'fps_avg').listen();
        _debugsettings.add(this, 'show_server_pos').listen();
        _debugsettings.add(this, 'show_dest_pos').listen();
        _debugsettings.add(this, 'local_time').listen();

        _debugsettings.open();

    var _consettings = this.gui.addFolder('Connection');
        _consettings.add(this, 'net_latency').step(0.001).listen();
        _consettings.add(this, 'net_ping').step(0.001).listen();

            //Se agrega lag falso
        var lag_control = _consettings.add(this, 'fake_lag').step(0.001).listen();
        lag_control.onChange(function(value){
            this.socket.send('l.' + value);
        }.bind(this));

        _consettings.open();

    var _netsettings = this.gui.addFolder('Networking');
        
        _netsettings.add(this, 'net_offset').min(0.01).step(0.001).listen();
        _netsettings.add(this, 'server_time').step(0.001).listen();
        _netsettings.add(this, 'client_time').step(0.001).listen();
        //_netsettings.add(this, 'oldest_tick').step(0.001).listen();

        _netsettings.open();

}; //game_core.client_create_debug_gui

game_core.prototype.client_reset_positions = function() {

    var player_host = this.players.self.host ?  this.players.self : this.players.other;
    var player_client = this.players.self.host ?  this.players.other : this.players.self;

        //El host siempre aparece en la parte superior izquierda.
    player_host.pos = { x:20,y:20 };
    player_client.pos = { x:500, y:200 };

        //Se asegura de que la física del jugador local se actualiza.
    this.players.self.old_state.pos = this.pos(this.players.self.pos);
    this.players.self.pos = this.pos(this.players.self.pos);
    this.players.self.cur_state.pos = this.pos(this.players.self.pos);

        //Posicionar todos los elementos de view debug a la posición de sus propietarios
    this.ghosts.server_pos_self.pos = this.pos(this.players.self.pos);

    this.ghosts.server_pos_other.pos = this.pos(this.players.other.pos);
    this.ghosts.pos_other.pos = this.pos(this.players.other.pos);

}; //game_core.client_reset_positions

game_core.prototype.client_onreadygame = function(data) {

    var server_time = parseFloat(data.replace('-','.'));

    var player_host = this.players.self.host ?  this.players.self : this.players.other;
    var player_client = this.players.self.host ?  this.players.other : this.players.self;

    this.local_time = server_time + this.net_latency;
    console.log('server time is about ' + this.local_time);

        //Almacena la información de los colores
    player_host.info_color = '#2288cc';
    player_client.info_color = '#cc8822';
        
        //Actualiza la información
    player_host.state = 'local_pos(hosting)';
    player_client.state = 'local_pos(joined)';

    this.players.self.state = 'YOU ' + this.players.self.state;

        //Se asegura que los colores están sincronizados
     this.socket.send('c.' + this.players.self.color);

}; //client_onreadygame

game_core.prototype.client_onjoingame = function(data) {

        //No soy el host
    this.players.self.host = false;
        //Actualiza el sestado local
    this.players.self.state = 'connected.joined.waiting';
    this.players.self.info_color = '#00bb00';

        //Se asegura de que las posiciones coincidan con el servidor y otros clientes.
    this.client_reset_positions();

}; //client_onjoingame

game_core.prototype.client_onhostgame = function(data) {

        //El servidor envía el tiempo cuando nos pide ser host, pero debe ser un nuevo juego.
        //el valor será muy pequeño (15 o 16 ms)
    var server_time = parseFloat(data.replace('-','.'));

        //Obtiene un estimado del tiempo actual del servidor.
    this.local_time = server_time + this.net_latency;

        //Setea un flag de que soy host.
    this.players.self.host = true;

        //Actualiza información de debug para mostrar estado
    this.players.self.state = 'hosting.waiting for a player';
    this.players.self.info_color = '#cc0000';

        //Se asegura de que empiezo en el luegar correcto como host.
    this.client_reset_positions();

}; //client_onhostgame

game_core.prototype.client_onconnected = function(data) {

        //El servidor responde que ahora estamos en juego,
        //Esto nos permite almacenar la información sobre nosotros mismos y establecer los colores
        //para mostrar que ahora estamos listos para jugar.
    this.players.self.id = data.id;
    this.players.self.info_color = '#cc0000';
    this.players.self.state = 'connected';
    this.players.self.online = true;

}; //client_onconnected

game_core.prototype.client_on_otherclientcolorchange = function(data) {

    this.players.other.color = data;

}; //game_core.client_on_otherclientcolorchange

game_core.prototype.client_onping = function(data) {

    this.net_ping = new Date().getTime() - parseFloat( data );
    this.net_latency = this.net_ping/2;

}; //client_onping

game_core.prototype.client_onnetmessage = function(data) {

    var commands = data.split('.');
    var command = commands[0];
    var subcommand = commands[1] || null;
    var commanddata = commands[2] || null;

    switch(command) {
        case 's': //mensaje del servidor

            switch(subcommand) {

                case 'h' : //solicitud de hostear un juego 
                    this.client_onhostgame(commanddata); break;

                case 'j' : //solicitud de unirse a un juego
                    this.client_onjoingame(commanddata); break;

                case 'r' : //solicitud de juego listo
                    this.client_onreadygame(commanddata); break;

                case 'e' : //solicitud de terminar juego
                    this.client_ondisconnect(commanddata); break;

                case 'p' : //server ping
                    this.client_onping(commanddata); break;

                case 'c' : //otro jugador cambió color
                    this.client_on_otherclientcolorchange(commanddata); break;

            } //subcommand

        break; //'s'
    } //command
                
}; //client_onnetmessage

game_core.prototype.client_ondisconnect = function(data) {
    
        //Cuando me desconecto, no sé si el otro jugador está conectado o no
        //pero como yo no lo estoy, todo se desconecta

    this.players.self.info_color = 'rgba(255,255,255,0.1)';
    this.players.self.state = 'not-connected';
    this.players.self.online = false;

    this.players.other.info_color = 'rgba(255,255,255,0.1)';
    this.players.other.state = 'not-connected';

}; //client_ondisconnect

game_core.prototype.client_connect_to_server = function() {
        
            //Almacena una referencia local de nuestra conexion al servidor
        this.socket = io.connect();

            //NO me conecto hasta no tener un server id
            //y son mostradas en el juego.
        this.socket.on('connect', function(){
            this.players.self.state = 'connecting';
        }.bind(this));

            //Enviado cuando estamos desconectados (red, servidor hacia abajo, etc)
        this.socket.on('disconnect', this.client_ondisconnect.bind(this));
            //Se envía cada vez que se simula el servidor. Esta es nuestra actualización autorizada
        this.socket.on('onserverupdate', this.client_onserverupdate_recieved.bind(this));
            //Manejar cuando nos conectamos al servidor, mostrando el estado y almacenando id's.
        this.socket.on('onconnected', this.client_onconnected.bind(this));
            //En caso de error sólo mostramos que no estamos conectados por ahora. No se pueden imprimir los datos.
        this.socket.on('error', this.client_ondisconnect.bind(this));
            //En el mensaje del servidor, analizamos los comandos y lo enviamos a los handlers.
        this.socket.on('message', this.client_onnetmessage.bind(this));

}; //game_core.client_connect_to_server


game_core.prototype.client_refresh_fps = function() {

        //Almacenamos los fps para 10 frame, agregandolos a este acumulador 
    this.fps = 1/this.dt;
    this.fps_avg_acc += this.fps;
    this.fps_avg_count++;

        //When we reach 10 frames we work out the average fps
    if(this.fps_avg_count >= 10) {

        this.fps_avg = this.fps_avg_acc/10;
        this.fps_avg_count = 1;
        this.fps_avg_acc = this.fps;

    } //alcanzó los 10 frames

}; //game_core.client_refresh_fps


game_core.prototype.client_draw_info = function() {

    this.ctx.fillStyle = 'rgba(255,255,255,0.3)';

        //Ayuda
    if(this.show_help) {

        this.ctx.fillText('net_offset : local offset of others players and their server updates. Players are net_offset "in the past" so we can smoothly draw them interpolated.', 10 , 30);
        this.ctx.fillText('server_time : last known game time on server', 10 , 70);
        this.ctx.fillText('client_time : delayed game time on client for other players only (includes the net_offset)', 10 , 90);
        this.ctx.fillText('net_latency : Time from you to the server. ', 10 , 130);
        this.ctx.fillText('net_ping : Time from you to the server and back. ', 10 , 150);
        this.ctx.fillText('fake_lag : Add fake ping/lag for testing, applies only to your inputs (watch server_pos block!). ', 10 , 170);
        this.ctx.fillText('client_smoothing/client_smooth : When updating players information from the server, it can smooth them out.', 10 , 210);
        this.ctx.fillText(' This only applies to other clients when prediction is enabled, and applies to local player with no prediction.', 170 , 230);

    } //if this.show_help

        //Muestra información para el host
    if(this.players.self.host) {

        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.fillText('You are the host', 10 , 465);

    } //if host


        //Setea el estilo a blanco de nuevo.
    this.ctx.fillStyle = 'rgba(255,255,255,1)';

}; //game_core.client_draw_help
