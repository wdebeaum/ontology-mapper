$(function() {

  function loadXSL(url, done) {
    var processor = null;
    if (window.XSLTProcessor) { // Gecko (Firefox), WebKit (Safari, Chrome)
      processor = new XSLTProcessor();
      $.ajax(url, { dataType: 'xml' }).
        done(function(data) {
	  processor.importStylesheet(data);
	  done(processor);
	}).
	fail(function(jqXHR, textStatus, errorThrown) {
	  console.log({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
	});
    } else if (window.ActiveXObject) { // IE
      processor = new ActiveXObject("Msxml2.DOMDocument");
      processor.async = false;
      processor.validateOnParse = true;
      processor.load(url);
      done(processor);
    } else {
      alert("Your browser doesn't support XSLTProcessor (Firefox, Chrome, Safari) or ActiveXObject (IE)");
      throw "Unsupported browser";
    }
  }

  function makeTripsOntTree(tripsOnt) {
    var treeNodes = {};
    // make a tree node for each ont type
    for (ontType in tripsOnt) {
      treeNodes[ontType] = { text: ontType, children: [] };
    }
    // build children lists from inherit relations
    for (ontType in tripsOnt) {
      if ('inherit' in tripsOnt[ontType]) {
	var parentName = tripsOnt[ontType].inherit;
	var childNode = treeNodes[ontType];
	if (!(parentName in treeNodes)) {
	  throw new Error('bogus parent of ont type ' + ontType + ': ' + parentName);
	}
	treeNodes[parentName].children.push(childNode);
      }
    }
    // return the root of the tree
    return treeNodes.root;
  }

  var jsTreeConfig = {
    core: {
      animation: false,
      themes: {
	icons: false,
	stripes: true
      },
    }
  };

  loadXSL('dsl-to-json.xsl', function(dslToJSON) {
    $.ajax('trips-ont-dsl.xml', { dataType: 'xml' }).
      done(function(tripsOntDSL) {
	window.tripsOnt = eval('(' + (
	  window.XSLTProcessor ?
	    dslToJSON.transformToDocument(tripsOntDSL).documentElement.innerHTML
	  : // IE
	    tripsOntDSL.transformNode(dslToJSON)
	) + ')');
	var tree = makeTripsOntTree(tripsOnt);
	$('#trips-tree').jstree(
	  $.extend(true, { core: { data: tree } }, jsTreeConfig)
	);
      }).
      fail(function(jqXHR, textStatus, errorThrown) {
	console.log({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
      });
  });

  var tree = [
    { text: 'root',
      state: { opened: true },
      children: [
        { text: 'foo',
	  state: { opened: false },
	  children: [ 'fool' ]
	},
	{ text: 'bar',
	  state: { opened: true },
	  children: ['barney', 'wilma']
	},
	{ text: 'baz' }
      ]
    }
  ];
  /*$('#trips-tree').jstree(
    $.extend(true, { core: { data: tree } }, jsTreeConfig)
  );*/
  $('#your-tree').jstree(
    $.extend(true, {
      core: {
	data: tree,
	check_callback: true
      },
      plugins: ['dnd']
    }, jsTreeConfig)
  );
  window.yourJsTree = $.jstree.reference('#your-tree');

  $('#your-tree').on('select_node.jstree', function(node, selected, evt) {
    // TODO display details of node if selected.length == 1
  });

  $('#rem-concept').on('click', function() {
    yourJsTree.delete_node(yourJsTree.get_selected(true));
    // TODO remove details for selected nodes, and stop displaying them
  });

  $('#add-concept').on('click', function() {
    yourJsTree.create_node(null, '(new concept)');
    // TODO add blank details, select new node
  });
});
