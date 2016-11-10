
	//Una ventana global para la raiz del juego.
var game = {};

	//Cuando está cargando, almacena referencias a canvas
	//e inicializa una instancia de juego.
window.onload = function(){

		//Crea una instancia cliente de juego
	game = new game_core();

			//recupera el puerto
		game.viewport = document.getElementById('viewport');
			
			//Ajusta el tamaño
		game.viewport.width = game.world.width;
		game.viewport.height = game.world.height;

			//Recupera contexto de renderización
		game.ctx = game.viewport.getContext('2d');

			//Setea el estilo de fuente
		game.ctx.font = '11px "Helvetica"';

		//Finaalmente, inicia el loop
	game.update( new Date().getTime() );

}; //window.onload