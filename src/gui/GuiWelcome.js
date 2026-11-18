import TR from 'gui/GuiTR';

// Shown while the scene is empty: SculptGL used to open on a sphere, which
// is in the way when the point is to work on a character.
var GuiWelcome = {};
var card = null;

function build(gui) {
  var main = gui._main;
  card = document.createElement('div');
  card.className = 'sgl-welcome';
  var title = document.createElement('h1');
  title.textContent = TR('welcomeTitle');
  var text = document.createElement('p');
  text.textContent = TR('welcomeFormats');
  var open = document.createElement('button');
  open.type = 'button';
  open.className = 'sgl-btn sgl-primary';
  open.textContent = TR('welcomeOpen');
  open.addEventListener('click', function () {
    document.getElementById('fileopen').click();
  });
  var sphere = document.createElement('button');
  sphere.type = 'button';
  sphere.className = 'sgl-btn';
  sphere.textContent = TR('welcomeSphere');
  sphere.addEventListener('click', function () {
    main.addSphere();
    main.resetCameraMeshes();
  });
  card.appendChild(title);
  card.appendChild(text);
  card.appendChild(open);
  card.appendChild(sphere);
  document.body.appendChild(card);
}

GuiWelcome.init = function (gui) {
  if (card) card.remove(); // the interface is rebuilt on language change
  build(gui);
  GuiWelcome.update(gui);
};

var hadModel = false;
GuiWelcome.update = function (gui) {
  var has = gui._main.getMeshes().length > 0;
  if (card) card.hidden = has;
  // the first time a model shows up on a touch screen, say how to move it
  if (has && !hadModel && document.body.classList.contains('sgl-touch')) toast(TR('gesturesToast'));
  hadModel = has;
};

function toast(text) {
  var node = document.createElement('div');
  node.className = 'sgl-toast';
  node.textContent = text;
  node.addEventListener('click', function () {
    node.remove();
  });
  document.body.appendChild(node);
  window.setTimeout(function () {
    node.remove();
  }, 6000);
}

export default GuiWelcome;
