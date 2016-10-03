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

  /* Remove all li elements from a ul before the one with class="template", and
   * then return that one.
   */
  function clearUlUpToTemplate(ul) {
    var li = ul.children().first();
    while (!li.hasClass('template')) {
      var nextLi = li.next();
      li.remove();
      li = nextLi;
    }
    return li;
  }

  /* Add a copy of li.template (with class="template" removed) just before it,
   * and return the copy.
   */
  function addLiBeforeTemplate(ul) {
    console.log(ul);
    var template = $(ul).find('li.template');
    var newLi = template.clone();
    newLi.removeClass('template');
    template.before(newLi);
    return newLi;
  }

  /* Remove the li just before li.template, if any, and return it (or null). */
  function remLiBeforeTemplate(ul) {
    var oldLi = $(ul).find('li.template').prev('li');
    if (oldLi.length == 0) {
      return null;
    } else {
      oldLi.remove();
      return oldLi;
    }
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
	window.tripsJsTree = $.jstree.reference('trips-tree');
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

  function formatMaybeDisj(x) {
    return '<b>' + x.replace(/ or /g, '</b> <i>or</i> <b>') + '</b>; ';
  }

  function formatFLType(inherit) {
    return 'fltype: ' + formatMaybeDisj(inherit);
  }

  function formatRole(roleRestrMap) {
    var roleNames =
      '<b>' +
      roleRestrMap.roles
	.replace(/ont:/g,'')
	.replace(/ /, '</b> <i>implements</i> <b>') +
      '</b>';
    var optionality = (roleRestrMap.optional ? ' (<i>optional</i>) ' : ' ');
    var restriction = '';
    if ('restriction' in roleRestrMap) {
      var fltype = '';
      var feats = '';
      if ('inherit' in roleRestrMap.restriction) {
	fltype = formatFLType(roleRestrMap.restriction.inherit);
      }
      if ('sem_feats' in roleRestrMap.restriction) {
	if ('inherit' in roleRestrMap.restriction.sem_feats) {
	  fltype = formatFLType(roleRestrMap.restriction.sem_feats.inherit);
	}
	if ('features' in roleRestrMap.restriction.sem_feats) {
	  feats =
	    $.map(roleRestrMap.restriction.sem_feats.features, function(v, k) {
	      return k + ': ' + formatMaybeDisj(v);
	    }).join('');
	}
      }
      restriction = 'restricted to ' + fltype + feats;
    }
    return roleNames + optionality + restriction;
  }

  $('#trips-tree').on('changed.jstree', function(evt, args) {
    if (args.selected.length == 1) {
      var name = tripsJsTree.get_text(args.selected[0]);
      $('#trips-concept-name').text(name);
      var concept = tripsOnt[name];
      $('#trips-concept-comment').text(concept.comment || '');
      // TODO sem_feats?
      var template = clearUlUpToTemplate($('#trips-roles'));
      if ('sem_frame' in concept) {
	concept.sem_frame.forEach(function(roleRestrMap, i) {
	  var li = $(document.createElement('li'));
	  li.insertBefore(template);
	  li.attr('id', 'trips-role-' + i);
	  li.html(formatRole(roleRestrMap));
	});
      }
      // TODO words/examples
      $('#trips-details').show();
    } else {
      $('#trips-details').hide();
    }
  });

  $('#your-tree').on('changed.jstree', function(evt, args) {
    // selection changed
    if (args.selected.length == 1) {
      var name = yourJsTree.get_text(args.selected[0]);
      $('#your-concept-name').val(name);
      // TODO fill other details
      $('#your-details').show();
    } else {
      $('#your-details').hide();
    }
  });

  $('#rem-concept').on('click', function() {
    yourJsTree.delete_node(yourJsTree.get_selected(true));
    // TODO remove details for selected nodes, and stop displaying them
  });

  $('#add-concept').on('click', function() {
    var newNodeID = yourJsTree.create_node(null, '(new concept)');
    // TODO add blank details
    yourJsTree.deselect_all();
    yourJsTree.select_node(newNodeID);
  });

  $('#add-trips-role, #add-your-role, #add-example').on('click', function(evt) {
    var ul = evt.target.parentNode.parentNode;
    addLiBeforeTemplate(ul);
  });

  $('#rem-trips-role, #rem-your-role, #rem-example').on('click', function(evt) {
    var ul = evt.target.parentNode.parentNode;
    remLiBeforeTemplate(ul);
  });
});
