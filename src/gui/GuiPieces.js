import TR from 'gui/GuiTR';

// "Pieces" sheet: every separate part of the character (face, body, hair,
// clothes...) with "editable" and "visible" switches, plus select all /
// none. Tools only act on editable pieces (see Picking); pieces that are
// not editable are drawn a little darker so it is clear they are protected.

var GuiPieces = {};
var sheet = null;
var list = null;

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

GuiPieces.nameOf = function (mesh, index) {
  return mesh.__sglName || TR('piecesUnnamed') + ' ' + (index + 1);
};

function refresh(main) {
  if (!sheet || sheet.hidden) return;
  list.replaceChildren();
  var meshes = main.getMeshes();
  if (!meshes.length) {
    list.appendChild(el('p', 'sgl-pieces-empty', TR('piecesEmpty')));
    return;
  }
  meshes.forEach(function (mesh, index) {
    var row = el('div', 'sgl-piece');
    var name = el('span', 'sgl-piece-name', GuiPieces.nameOf(mesh, index));
    var edit = el('label', 'sgl-piece-toggle');
    var editBox = el('input');
    editBox.type = 'checkbox';
    editBox.checked = !mesh.__frozen;
    editBox.addEventListener('change', function () {
      mesh.__frozen = !editBox.checked;
      main.render();
    });
    edit.appendChild(editBox);
    edit.appendChild(document.createTextNode(' ✎'));
    edit.title = TR('piecesEditable');
    var see = el('label', 'sgl-piece-toggle');
    var seeBox = el('input');
    seeBox.type = 'checkbox';
    seeBox.checked = mesh.isVisible();
    seeBox.addEventListener('change', function () {
      mesh.setVisible(seeBox.checked);
      main.render();
    });
    see.appendChild(seeBox);
    see.appendChild(document.createTextNode(' 👁'));
    see.title = TR('piecesVisible');
    var only = el('button', 'sgl-btn sgl-small', TR('piecesOnly'));
    only.type = 'button';
    only.addEventListener('click', function () {
      main.getMeshes().forEach(function (other) {
        other.__frozen = other !== mesh;
      });
      main.setMesh(mesh);
      main.render();
      refresh(main);
    });
    row.appendChild(name);
    row.appendChild(edit);
    row.appendChild(see);
    row.appendChild(only);
    list.appendChild(row);
  });
}

function setAll(main, frozen) {
  main.getMeshes().forEach(function (mesh) {
    mesh.__frozen = frozen;
    if (!frozen) mesh.setVisible(true);
  });
  main.render();
  refresh(main);
}

GuiPieces.init = function (gui) {
  var main = gui._main;
  if (sheet) sheet.remove();
  sheet = el('section', 'sgl-pieces');
  sheet.hidden = true;
  var head = el('div', 'sgl-pieces-head');
  head.appendChild(el('h2', '', TR('piecesTitle')));
  var close = el('button', 'sgl-btn sgl-small', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', TR('piecesClose'));
  close.addEventListener('click', function () {
    sheet.hidden = true;
  });
  head.appendChild(close);
  var actions = el('div', 'sgl-pieces-actions');
  var all = el('button', 'sgl-btn sgl-small', TR('piecesAll'));
  all.type = 'button';
  all.addEventListener('click', function () {
    setAll(main, false);
  });
  var none = el('button', 'sgl-btn sgl-small', TR('piecesNone'));
  none.type = 'button';
  none.addEventListener('click', function () {
    setAll(main, true);
  });
  actions.appendChild(all);
  actions.appendChild(none);
  list = el('div', 'sgl-pieces-list');
  sheet.appendChild(head);
  sheet.appendChild(el('p', 'sgl-pieces-help', TR('piecesHelp')));
  sheet.appendChild(actions);
  sheet.appendChild(list);
  document.body.appendChild(sheet);
};

GuiPieces.toggle = function (main) {
  sheet.hidden = !sheet.hidden;
  refresh(main);
};

GuiPieces.update = function (main) {
  refresh(main);
};

export default GuiPieces;
