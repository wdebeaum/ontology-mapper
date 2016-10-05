$(function() {
  //var DSL_DATA_PATH = '../dsl/';
  var DSL_DATA_PATH = 'dsl/';

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

  function xslTransformAndEval(proc, doc) {
    return eval('(' + (
      window.XSLTProcessor ?
	proc.transformToDocument(doc).documentElement.innerHTML
      : // IE
	doc.transformNode(proc)
    ) + ')');
  }

  function setXSLParameter(proc, k, v) {
    if (window.XSLTProcessor) {
      proc.setParameter('', k, v);
    } else { // IE
      proc.addParameter(k, v);
    }
  }

  function makeTripsOntTree(tripsOnt) {
    var treeNodes = {};
    // make a tree node for each ont type
    for (ontType in tripsOnt) {
      treeNodes[ontType] = { id: 'ont__' + ontType, text: ontType, children: [] };
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
    var template = $(ul).find('li.template');
    var id = template.attr('id');
    var newLi = template.clone();
    newLi.removeClass('template');
    newLi.insertBefore(template);
    newLi.attr('id', id.replace(/template/, '' + newLi.index()));
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

  function selectedLi(ul) {
    return ul.children().filter('.selected');
  }

  /* onclick handler for selectable <li> elements */
  window.selectLi = function(evt) {
    var li = $(evt.currentTarget);
    var ul = li.parent();
    selectedLi(ul).removeClass('selected');
    li.addClass('selected');
    return true;
  };

  var svgNS = "http://www.w3.org/2000/svg";

  function addLine(linesG, tripsID, yourID) {
    var tripsHandle = $('#' + tripsID + '__handle');
    var yourHandle = $('#' + yourID + '__handle');
    var line = $(document.createElementNS(svgNS, 'line'));
    var tripsScroll;
    var yourScroll;
    switch (linesG.attr('id')) {
      case 'concept-lines':
	tripsScroll = $('#trips-tree').scrollTop();
	yourScroll = $('#your-tree').scrollTop();
	break;
      case 'role-lines':
	tripsScroll = $('#trips-details').scrollTop();
	yourScroll = $('#your-details').scrollTop();
	break;
      default:
        throw new Error('WTF');
    }
    line.attr('x1', tripsHandle.attr('cx'));
    line.attr('y1', parseInt(tripsHandle.attr('cy')) - tripsScroll);
    line.attr('x2', yourHandle.attr('cx'));
    line.attr('y2', parseInt(yourHandle.attr('cy')) - yourScroll);
    line.attr('trips-handle', tripsID + '__handle');
    line.attr('your-handle', yourID + '__handle');
    line.attr('id', tripsID + '__to__' + yourID);
    linesG.append(line);
  }

  function remLine(tripsID, yourID) {
    $('#' + tripsID + '__to__' + yourID).remove();
  }

  function scrollLine(side, treeOrDetails, line) {
    var coord = ('trips' === side ? 'y1' : 'y2');
    var scroll = $('#' + side + '-' + treeOrDetails).scrollTop();
    var handle = $('#' + line.attr(side + '-handle'));
    line.attr(coord, parseInt(handle.attr('cy')) - scroll);
  }

  function updateMap(side, conceptOrRole, opts) {
    if (!opts) { opts = {}; }
    var mapWidth = $('.map')[0].offsetWidth - 4; // FIXME see CSS
    var handlesG = $('#' + side + '-' + conceptOrRole + '-handles');
    if (opts.scroll) {
      var scroll =
          $('#' + side + '-' +
		  (('concept' === conceptOrRole) ? 'tree' : 'details')
	  ).scrollTop();
      handlesG.attr('transform', 'translate(0, ' + (-scroll) + ')');
    }
    // iterate over (visible) nodes
    var firstNode;
    var hasNext;
    var nextNode;
    switch (conceptOrRole) {
      case 'concept':
	var jsTree = window[side + 'JsTree'];
        firstNode = jsTree.firstNode;
	hasNext = function(node) { return node; };
	nextNode = function(node) { return jsTree.get_next_dom(node)[0]; };
	break;
      case 'role':
        firstNode = $('#' + side + '-roles li:first-child')[0];
	hasNext = function(node) { return ('template' !== node.className); };
	nextNode = function(node) { return node.nextSibling; };
	break;
      default:
        throw new Error('WTF');
    }
    if (opts.openClose) {
      handlesG.empty();
      for (var node = firstNode; hasNext(node); node = nextNode(node)) {
	var handle = document.createElementNS(svgNS, 'circle');
	handle.setAttribute('class', 'handle');
	handle.setAttribute('r', '1ex');
	handle.setAttribute('cx', ('trips' === side ? 0 : mapWidth));
	handle.setAttribute('cy', node.offsetTop + node.firstChild.offsetHeight/2);
	if (node.id) {
	  handle.setAttribute('id', node.id + '__handle');
	}
	handlesG.append(handle);
      }
    }
    var linesG = $('#' + conceptOrRole + '-lines');
    if (opts.openClose) {
      linesG.empty();
      // TODO re-add lines
    } else if (opts.scroll) {
      linesG.children().each(function(i, line) {
	scrollLine(side, ('concept' === conceptOrRole ? 'tree' : 'details'), $(line));
      });
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

  var dslToJSON;
  loadXSL('dsl-to-json.xsl', function(dslToJSONarg) {
    dslToJSON = dslToJSONarg;
    $.ajax(DSL_DATA_PATH + 'trips-ont-dsl.xml', { dataType: 'xml' }).
      done(function(tripsOntDSL) {
	window.tripsOnt = xslTransformAndEval(dslToJSON, tripsOntDSL);
	setXSLParameter(dslToJSON, 'senses-only', true);
	var tree = makeTripsOntTree(tripsOnt);
	$('#trips-tree').jstree(
	  $.extend(true, { core: { data: tree } }, jsTreeConfig)
	);
	window.tripsJsTree = $.jstree.reference('trips-tree');
	$('#trips-tree').on('loaded.jstree', function() {
	  tripsJsTree.firstNode = $('#' + tree.id)[0];
	  updateMap('trips', 'concept', { openClose: true });
	});
      }).
      fail(function(jqXHR, textStatus, errorThrown) {
	console.log({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
      });
  });

  /*var tree = [
    { text: 'root',
      id: 'your__root',
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
  ];*/
  /*$('#trips-tree').jstree(
    $.extend(true, { core: { data: tree } }, jsTreeConfig)
  );*/
  $('#your-tree').jstree(
    $.extend(true, {
      core: {
	data: [], //tree,
	check_callback: true
      },
      plugins: ['dnd']
    }, jsTreeConfig)
  );
  window.yourJsTree = $.jstree.reference('#your-tree');
  $('#your-tree').on('loaded.jstree', function() {
    yourJsTree.firstNode = $('#your__root')[0];
    updateMap('your', 'concept', { openClose: true });
  });

  /* Modify childFeats to include any parts of parentFeats that it doesn't
   * override.
   */
  function mergeFeats(childFeats, parentFeats) {
    if (('inherit' in parentFeats) && !('inherit' in childFeats)) {
      childFeats.inherit = parentFeats.inherit;
    }
    if ('features' in parentFeats) {
      if ('features' in childFeats) {
	for (var k in parentFeats.features) {
	  if (!(k in childFeats.features)) {
	    childFeats.features[k] = parentFeats.features[k];
	  }
	}
      } else {
	childFeats.features = $.extend(true, {}, parentFeats.features);
      }
    }
  }

  /* Fill semFeatsOut={} and semFrameOut=[] by going up the hierarchy from
   * concept. If inherited=true, mark any roles added this way as inherited.
   */
  function applyInheritance(concept, semFeatsOut, semFrameOut, inherited) {
    // fill semFeatsOut
    if ('sem_feats' in concept) {
      mergeFeats(semFeatsOut, concept.sem_feats);
    }
    // fill semFrameOut
    if ('sem_frame' in concept) {
      concept.sem_frame.forEach(function(newRoleRestrMap) {
	var newRoles = newRoleRestrMap.roles.split(' ');
	var oldRoleRestrMap;
	semFrameOut.forEach(function(m) {
	  if (m.roles.split(' ').includes(newRoles[0])) {
	    oldRoleRestrMap = m;
	  }
	});
	if ('undefined' === typeof oldRoleRestrMap) {
	  // just deep copy newRoleRestrMap as a new element of semFrameOut
	  var roleRestrMap = $.extend(true, {}, newRoleRestrMap);
	  if (inherited) { roleRestrMap.inherited = true; }
	  semFrameOut.push(roleRestrMap);
	} else { // have oldRoleRestrMap
	  // copy anything in newRoleRestrMap into oldRoleRestrMap that it
	  // doesn't already have (i.e. that it doesn't override)
	  // roles/implements
	  var oldRoles = oldRoleRestrMap.roles.split(' ');
	  newRoles.slice(1).forEach(function(newRole) {
	    if (!oldRoles.include(newRole)) {
	      oldRoles.push(newRole);
	    }
	  });
	  // optionality isn't inherited?
	  // restriction
	  if ('restriction' in newRoleRestrMap) {
	    if ('restriction' in oldRoleRestrMap) {
	      // merge restrictions
	      if ('sem_feats' in newRoleRestrMap.restriction) {
		if ('sem_feats' in oldRoleRestrMap.restriction) {
		  mergeFeats(oldRoleRestrMap.restriction.sem_feats,
			     newRoleRestrMap.restriction.sem_feats);
		} else { // no old sem_feats
		  // just deep copy new into old
		  oldRoleRestrMap.restriction.sem_feats =
		    $.extend(true, {}, newRoleRestrMap.restriction.sem_feats);
		}
	      }
	    } else { // no old restriction
	      // just deep copy new into old
	      oldRoleRestrMap.restriction =
	        $.extend(true, {}, newRoleRestrMap.restriction);
	    }
	  }
	}
      });
    }
    // keep going up
    if ('inherit' in concept) {
      applyInheritance(
          tripsOnt[concept.inherit], semFeatsOut, semFrameOut, true);
    }
  }

  /* load words and examples if necessary, and then call done() */
  function ensureSenses(conceptName, done) {
    var concept = tripsOnt[conceptName];
    if ('senses' in concept) {
      done();
    } else {
      $.ajax(DSL_DATA_PATH + 'ONT%3a%3a' + conceptName + '.xml', { dataType: 'xml' }).
	done(function(conceptDSL) {
	  concept.senses = xslTransformAndEval(dslToJSON, conceptDSL);
	  done();
	}).
	fail(function(jqXHR, textStatus, errorThrown) {
	  console.log({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
	});
    }
  }

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
      // load words and examples from ONT::$name.xml
      // (first clear these so they don't show the wrong values before load)
      var examplesUl = $('#trips-examples');
      examplesUl.empty();
      var wordsSpan = $('#trips-words')
      wordsSpan.empty();
      ensureSenses(name, function() {
	var words = [];
	concept.senses.forEach(function(sense) {
	  words.push(sense.word + '[' + sense.pos + ']');
	  if ('examples' in sense) {
	    sense.examples.forEach(function(example) {
	      var li = $(document.createElement('li'));
	      li.text(example);
	      examplesUl.append(li);
	    });
	  }
	});
	wordsSpan.text(words.join(', '));
      });
      // get rest of details from trips-ont-dsl.xml we already loaded
      $('#trips-concept-comment').text(concept.comment || '');
      var sem_feats = {};
      var sem_frame = [];
      applyInheritance(concept, sem_feats, sem_frame);
      // TODO sem_feats?
      var template = clearUlUpToTemplate($('#trips-roles'));
      sem_frame.forEach(function(roleRestrMap, i) {
	var li = $(document.createElement('li'));
	li.insertBefore(template);
	li.attr('id', 'trips-role-' + i);
	li.on('click', selectLi);
	li.html(formatRole(roleRestrMap));
      });
      $('#trips-details').show();
    } else {
      $('#trips-details').hide();
    }
    // let things render before updating map
    setTimeout(function() {
      updateMap('trips', 'role', { openClose: true });
    }, 0);
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
    updateMap('your', 'role', { openClose: true });
  });

  $('#trips-tree').on('after_open.jstree after_close.jstree', function(evt) {
    updateMap('trips', 'concept', { openClose: true });
    return true;
  });

  $('#your-tree').on('after_open.jstree after_close.jstree', function(evt) {
    updateMap('your', 'concept', { openClose: true });
    return true;
  });

  $('#trips-tree').on('scroll', function(evt) {
    updateMap('trips', 'concept', { scroll: true });
    return true;
  });

  $('#your-tree').on('scroll', function(evt) {
    updateMap('your', 'concept', { scroll: true });
    return true;
  });

  $('#trips-details').on('scroll', function(evt) {
    updateMap('trips', 'role', { scroll: true });
    return true;
  });

  $('#your-details').on('scroll', function(evt) {
    updateMap('your', 'role', { scroll: true });
    return true;
  });

  $('#trips-concept-search').on('submit', function(evt) {
    evt.preventDefault();
    var search = $(this['search']).val();
    console.log('searching trips ontology for concept named ' + search);
    if (search in tripsOnt) {
      tripsJsTree.deselect_all();
      tripsJsTree.select_node('ont__' + search);
      $('#ont__' + search)[0].scrollIntoView(true);
    } else {
      alert(search + ' not found');
    }
  });

  $('#your-concept-search').on('submit', function(evt) {
    evt.preventDefault();
    var search = $(this['search']).val();
    console.log('searching your ontology for concept named ' + search);
    // TODO how to find concepts in your tree? AFAIK can't change IDs of tree nodes, so can't do the same thing as the trips side
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

  $('#add-concept-mapping, #rem-concept-mapping').on('click', function(evt) {
    var tripsIDs = tripsJsTree.get_selected();
    var yourIDs = yourJsTree.get_selected();
    if (tripsIDs.length != 1 || yourIDs.length != 1) {
      alert('Select one TRIPS concept and one of your concepts before clicking the add/remove mapping buttons.');
      return;
    }
    if (/^add-/.test(this.id)) {
      addLine($('#concept-lines'), tripsIDs[0], yourIDs[0]);
    } else {
      remLine(tripsIDs[0], yourIDs[0]);
    }
  });

  $('#add-role-mapping, #rem-role-mapping').on('click', function(evt) {
    var tripsLIs = selectedLi($('#trips-roles'));
    var yourLIs = selectedLi($('#your-roles'));
    if (tripsLIs.length != 1 || yourLIs.length != 1) {
      alert('Select a TRIPS role and one of your roles before clicking the add/remove mapping buttons.');
      return;
    }
    if (/^add-/.test(this.id)) {
      addLine($('#role-lines'), tripsLIs[0].id, yourLIs[0].id);
    } else {
      remLine(tripsLIs[0].id, yourLIs[0].id);
    }
  });

  $('#add-trips-role, #add-your-role, #add-example, #rem-trips-role, #rem-your-role, #rem-example').on('click', function(evt) {
    var ul = evt.target.parentNode.parentNode;
    if (/^add-/.test(this.id)) {
      addLiBeforeTemplate(ul);
    } else {
      remLiBeforeTemplate(ul);
    }
    if (/-roles$/.test(ul.id)) {
      var side = (/^your-/.test(ul.id) ? 'your' : 'trips');
      setTimeout(function() {
	updateMap(side, 'role', { openClose: true });
      }, 0);
    }
  });

  /* your details onchange handlers */

  $('#your-concept-name').on('change', function(evt) {
    // TODO change name of selected concept
  });

  $('#your-comment').on('change', function(evt) {
    // TODO
  });

  window.changeYourRoleName = function(evt) {
    // TODO
  };

  window.changeYourRoleRestr = function(evt) {
    // TODO
  };

  $('#your-words').on('change', function(evt) {
    // TODO
  });

  window.changeYourExample = function(evt) {
    // TODO
  };
});
