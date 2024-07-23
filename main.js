document.addEventListener("DOMContentLoaded", function() {
    const gridSize = 50;
    const rows = 10;
    const cols = 10;

    const offsetX = 50;
    const offsetY = 50;

    const playerBoard = createBoard("Player1");
    const computerBoard = createBoard("Player2");

    const playerShips = [];
    const playerGuesses = [];
    const computerShips = [];
    const computerGuesses = [];

    function createBoard(canvasId) {
        const c = document.getElementById(canvasId);
        const ctx = c.getContext("2d");

        ctx.strokeStyle = "black";
        for (let i = 0; i <= cols; i++) {
            ctx.moveTo(i * gridSize + offsetX, offsetY);
            ctx.lineTo(i * gridSize + offsetX, rows * gridSize + offsetY);
        }
        for (let j = 0; j <= rows; j++) {
            ctx.moveTo(offsetX, j * gridSize + offsetY);
            ctx.lineTo(cols * gridSize + offsetX, j * gridSize + offsetY);
        }
        ctx.stroke();

        ctx.font = '16px Arial';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < cols; i++) {
            const label = String.fromCharCode(65 + i);
            ctx.fillText(label, i * gridSize + offsetX + gridSize / 2, offsetY / 2);
        }

        for (let j = 0; j < rows; j++) {
            const label = j + 1;
            ctx.fillText(label, offsetX / 2, j * gridSize + offsetY + gridSize / 2);
        }

        return {
            canvas: c,
            context: ctx,
            ships: []
        };
    }

    function placeComputerShips() {
        const shipSizes = playerShips.map(ship => ship.width > ship.height ? ship.width : ship.height);
        shipSizes.forEach(size => {
            let placed = false;
            while (!placed) {
                const orientation = Math.random() < 0.5 ? "horizontal" : "vertical";
                let x, y;
                if (orientation === "horizontal") {
                    x = Math.floor(Math.random() * (cols - size + 1));
                    y = Math.floor(Math.random() * rows);
                } else {
                    x = Math.floor(Math.random() * cols);
                    y = Math.floor(Math.random() * (rows - size + 1));
                }
                if (!isOverlap(x, y, size, orientation, computerShips)) {
                    computerShips.push({
                        x,
                        y,
                        width: orientation === "horizontal" ? size : 1,
                        height: orientation === "horizontal" ? 1 : size,
                        hits: 0
                    });
                    placed = true;
                }
            }
        });
    }

    function isOverlap(x, y, size, orientation, ships) {
        for (let i = 0; i < ships.length; i++) {
            const ship = ships[i];
            if (orientation === "horizontal") {
                for (let j = 0; j < size; j++) {
                    if (x + j >= ship.x && x + j < ship.x + ship.width && y >= ship.y && y < ship.y + ship.height) {
                        return true;
                    }
                }
            } else {
                for (let j = 0; j < size; j++) {
                    if (x >= ship.x && x < ship.x + ship.width && y + j >= ship.y && y + j < ship.y + ship.height) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function allowDrop(ev) {
        ev.preventDefault();
    }

    function drag(ev) {
        ev.dataTransfer.setData("text", ev.target.id);
    }

    function drop(ev) {
        ev.preventDefault();
        const shipId = ev.dataTransfer.getData("text");
        const shipElement = document.getElementById(shipId);

        const rect = ev.target.getBoundingClientRect();
        const offsetXFromRect = ev.clientX - rect.left - offsetX;
        const offsetYFromRect = ev.clientY - rect.top - offsetY;

        const x = Math.floor(offsetXFromRect / gridSize);
        const y = Math.floor(offsetYFromRect / gridSize);

        const shipWidth = shipElement.width / gridSize;
        const shipHeight = shipElement.height / gridSize;

        if (x >= 0 && y >= 0 && x + shipWidth <= cols && y + shipHeight <= rows) {
            if (!playerShips.some(ship => (x < ship.x + ship.width && x + shipWidth > ship.x && y === ship.y) || (y < ship.y + ship.height && y + shipHeight > ship.y && x === ship.x))) {
                playerShips.push({ x, y, width: shipWidth, height: shipHeight, hits: 0 });
                ev.target.getContext("2d").fillStyle = "red";
                ev.target.getContext("2d").fillRect(x * gridSize + offsetX, y * gridSize + offsetY, shipElement.width, shipElement.height);
                shipElement.style.display = "none";
            } else {
                alert("Ships overlap!");
            }
        } else {
            alert("Ship doesn't fit in the board!");
        }
    }

    function playerGuess(ev) {
        const rect = ev.target.getBoundingClientRect();
        const offsetXFromRect = ev.clientX - rect.left - offsetX;
        const offsetYFromRect = ev.clientY - rect.top - offsetY;

        const x = Math.floor(offsetXFromRect / gridSize);
        const y = Math.floor(offsetYFromRect / gridSize);

        if (x >= 0 && y >= 0 && x < cols && y < rows && !playerGuesses.some(guess => guess.x === x && guess.y === y)) {
            playerGuesses.push({ x, y });

            const ctx = computerBoard.context;

            const hitShip = computerShips.find(ship => ship.x <= x && ship.x + ship.width > x && ship.y <= y && ship.y + ship.height > y);
            if (hitShip) {
                ctx.fillStyle = "red";
                hitShip.hits += 1;
                if (hitShip.hits === hitShip.width * hitShip.height) {
                    alert("You sunk a ship!");
                }
            } else {
                ctx.fillStyle = "blue";
            }
            ctx.fillRect(x * gridSize + offsetX, y * gridSize + offsetY, gridSize, gridSize);

            if (computerShips.every(ship => ship.hits === ship.width * ship.height)) {
                setTimeout(() => {
                    if (confirm("You won! Game over. Play again?")) {
                        restartGame();
                    }
                }, 100);
            } else {
                computerGuess();
            }
        } else {
            alert("You already guessed that spot!");
        }
    }

    function computerGuess() {
        let x, y;
        do {
            x = Math.floor(Math.random() * cols);
            y = Math.floor(Math.random() * rows);
        } while (computerGuesses.some(guess => guess.x === x && guess.y === y));

        computerGuesses.push({ x, y });

        const ctx = playerBoard.context;

        const hitShip = playerShips.find(ship => ship.x <= x && ship.x + ship.width > x && ship.y <= y && ship.y + ship.height > y);
        if (hitShip) {
            ctx.fillStyle = "black";
            hitShip.hits += 1;
            if (hitShip.hits === hitShip.width * hitShip.height) {
                alert("Computer sunk a ship!");
            }
        } else {
            ctx.fillStyle = "blue";
        }
        ctx.fillRect(x * gridSize + offsetX, y * gridSize + offsetY, gridSize, gridSize);

        if (playerShips.every(ship => ship.hits === ship.width * ship.height)) {
            setTimeout(() => {
                if (confirm("Computer won! Game over. Play again?")) {
                    restartGame();
                }
            }, 100);
        }
    }

    function startGame() {
        if (playerShips.length === 5) {
            placeComputerShips();
            document.getElementById("playerShips").style.display = "none";
            alert("Game started! Begin guessing.");
        } else {
            alert("Please place all your ships before starting the game.");
        }
    }

    function restartGame() {
        window.location.reload();
    }

    window.allowDrop = allowDrop;
    window.drag = drag;
    window.drop = drop;
    window.playerGuess = playerGuess;
    window.startGame = startGame;
    window.restartGame = restartGame;
});
