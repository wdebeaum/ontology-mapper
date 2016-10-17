$(function() {
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
	$(proc.transformToDocument(doc).documentElement).text()
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
   * and return the copy. If extraSelector is given, add it to the selector we
   * use to find the template to copy (but still insert before the first
   * template).
   */
  function addLiBeforeTemplate(ul, extraSelector) {
    var firstTemplate = $(ul).children('li.template').first();
    var selectedTemplate = $(ul).children('li.template' + (extraSelector || ''));
    var id = selectedTemplate.attr('id');
    var newLi = selectedTemplate.clone();
    newLi.removeClass('template');
    newLi.insertBefore(firstTemplate);
    newLi.attr('id', id.replace(/template/, '' + newLi.index()));
    return newLi;
  }

  /* Remove the li just before li.template, if any, and return it (or null). */
  function remLiBeforeTemplate(ul) {
    var oldLi = $(ul).children('li.template').prev('li');
    if (oldLi.length == 0) {
      return null;
    } else {
      oldLi.trigger('rem');
      oldLi.remove();
      return oldLi;
    }
  }

  function selectedLi(ul) {
    return ul.find('.selected');
  }

  function deselectAllLis(ul) {
    selectedLi(ul).removeClass('selected');
  }

  /* onclick handler for selectable <li> elements */
  window.selectLi = function(li) {
    var li = $(li);
    var ul = li.closest('.selectable');
    deselectAllLis(ul);
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
        throw new Error('WTF: ' + linesG[0]);
    }
    line.attr('x1', tripsHandle.attr('cx'));
    line.attr('y1', parseInt(tripsHandle.attr('cy')) - tripsScroll);
    line.attr('x2', yourHandle.attr('cx'));
    line.attr('y2', parseInt(yourHandle.attr('cy')) - yourScroll);
    line.attr('trips-handle', tripsID + '__handle');
    line.attr('your-handle', yourID + '__handle');
    line.attr('id', tripsID + '__to__' + yourID);
    linesG.append(line);
    return line;
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
    var done;
    var nextNode;
    switch (conceptOrRole) {
      case 'concept':
	var jsTree = window[side + 'JsTree'];
	firstNode = jsTree.element.children().children()[0]; // HACK
	done = function(node) { return !node; };
	nextNode = function(node) { return jsTree.get_next_dom(node)[0]; };
	break;
      case 'role':
        firstNode = $('#' + side + '-roles li:first-child')[0];
	done = function(node) { return $(node).hasClass('template'); };
	nextNode = function(node, goingUp) {
	  if (!goingUp) {
	    // try going down a level first
	    var down = $(node).find('li');
	    if (down.length > 0 && !done(down[0])) {
	      return down[0];
	    }
	  }
	  var sib = node.nextSibling;
	  // go up a level if we're done with this level and we can go up
	  if (done(sib)) {
	    var up = node.parentNode.parentNode;
	    if (up.tagName === 'LI') {
	      return nextNode(up, true);
	    }
	  }
	  return sib;
	};
	break;
      default:
        throw new Error('WTF');
    }
    if (opts.openClose) {
      handlesG.empty();
      for (var node = firstNode; !done(node); node = nextNode(node)) {
	var handle = document.createElementNS(svgNS, 'circle');
	handle.setAttribute('class', 'handle');
	handle.setAttribute('r', '1ex');
	handle.setAttribute('cx', ('trips' === side ? 0 : mapWidth));
	handle.setAttribute('cy', node.offsetTop + node.firstChild.offsetHeight/2);
	if (node.id) {
	  handle.setAttribute('id', node.id + '__handle');
	}
	handlesG.append(handle);
	$(handle).on('mousedown', mouseDownOnHandle);
	$(handle).on('mouseup', mouseUpOnHandle);
      }
    }
    var linesG = $('#' + conceptOrRole + '-lines');
    if (opts.openClose) {
      linesG.empty();
      switch (conceptOrRole) {
	case 'concept':
	  for (var yourID in yourOntById) {
	    var yourConcept = yourOntById[yourID];
	    var yourHandle = $('#' + yourID + '__handle');
	    yourConcept.conceptMappings.forEach(function(m) {
	      var tripsID = 'ont__' + m.tripsConcept.name;
	      var tripsHandle = $('#' + tripsID + '__handle');
	      if (yourHandle.length == 0 ||
	          tripsHandle.length == 0) { // hidden
		// TODO show lines for hidden concepts in a different color
		delete m.line;
	      } else {
		m.line = addLine(linesG, tripsID, yourID);
	      }
	    });
	  }
	  break;
	case 'role':
	  var tripsIDs = tripsJsTree.get_selected();
	  var yourIDs = yourJsTree.get_selected();
	  var conceptLine;
	  if (tripsIDs.length == 1 && yourIDs.length == 1) {
	    var tripsID = tripsIDs[0];
	    var yourID = yourIDs[0];
	    var tripsConcept = tripsOnt[tripsID.replace(/^ont__/,'')];
	    var yourConcept = yourOntById[yourID];
	    var conceptMapping = yourConcept.conceptMappings.find(function(m) { return (m.tripsConcept === tripsConcept); });
	    if (conceptMapping !== undefined) {
	      conceptLine = conceptMapping.line;
	      selectLi(conceptLine);
	    }
	    yourConcept.roleMappings.forEach(function(m) {
	      if (m.tripsConcept === tripsConcept) {
		var tripsRoleIndex = tripsConcept.dynamic_sem_frame.indexOf(m.tripsRole);
		var yourRoleIndex = yourConcept.roles.indexOf(m.yourRole);
		var tripsRoleID = 'trips-role-' + tripsRoleIndex;
		var yourRoleID = 'your-role-' + yourRoleIndex;
		if (m.tripsRolePath) {
		  var tripsRolePathIndex = m.tripsRole.paths.indexOf(m.tripsRolePath);
		  tripsRoleID = 'path-' + tripsRolePathIndex + '-of-' + tripsRoleID;
		}
		m.line = addLine(linesG, tripsRoleID, yourRoleID);
	      } else {
		delete m.line;
	      }
	    });
	  }
	  if (conceptLine === undefined) {
	    deselectAllLis($('#concept-lines'));
	  }
	  break;
	default:
	  throw new Error('WTF');
      }
    } else if (opts.scroll) {
      linesG.children().each(function(i, line) {
	scrollLine(side, ('concept' === conceptOrRole ? 'tree' : 'details'), $(line));
      });
    }
  }

  // dragging state
  var dragging = false;
  var dragFromHandleID;
  var dragFromSide; // 'trips' or 'your'
  var draggedSide; // '1' or '2', opposite of above
  var dragFromConceptOrRole; // 'concept' or 'role'
  var draggedLine;

  function endDragging() {
    //console.log('endDragging');
    dragging = false;
    draggedLine = undefined;
    $(document.body).off('mousemove mouseup');
  }

  function discardDraggedMapping() {
    //console.log('discardDraggedMapping');
    draggedLine.remove();
    endDragging();
  }

  function dragPositionInSVG(evt) {
    var svgOffset = $('#' + dragFromConceptOrRole + '-mapping').offset();
    return {
      x: '' + Math.floor(evt.pageX - svgOffset.left) + 'px',
      y: '' + Math.floor(evt.pageY - svgOffset.top) + 'px'
    };
  }

  function mouseMoveWhileDragging(evt) {
    var pos = dragPositionInSVG(evt);
    //console.log(pos);
    draggedLine.attr('x' + draggedSide, pos.x);
    draggedLine.attr('y' + draggedSide, pos.y);
    return false;
  }

  function mouseUpWhileDragging(evt) {
    //console.log('mouseUpWhileDragging');
    discardDraggedMapping();
  }

  // end dragging mapping, and add mapping if valid
  function mouseUpOnHandle(evt) {
    //console.log('mouseUpOnHandle');
    if (!dragging) { return false; }
    var dragToHandleID = $(this).attr('id');
    var handlesGID = $(this).parent().attr('id');
    var fields = handlesGID.split(/-/);
    dragToSide = fields[0];
    dragToConceptOrRole = fields[1];
    // validate drag
    if (dragToSide === dragFromSide ||
        dragToConceptOrRole !== dragFromConceptOrRole) {
      console.log('invalid drag');
      discardDraggedMapping();
      return;
    }
    //console.log('valid drag');
    draggedLine.attr(dragToSide + '-handle', dragToHandleID);
    var tripsID = (dragFromSide === 'trips' ? dragFromHandleID : dragToHandleID).replace(/__handle$/,'');
    var yourID = (dragToSide === 'trips' ? dragFromHandleID : dragToHandleID).replace(/__handle$/,'');
    draggedLine.attr('id', tripsID + '__to__' + yourID);
    // TODO? adjust line coords to be exactly at the centers of the handles?
    // or just delete the line and let the call below add it again?
    switch (dragFromConceptOrRole) {
      case 'concept':
        addConceptMapping(
	    tripsOnt[tripsID.replace(/^ont__/,'')], yourOntById[yourID],
	    draggedLine);
	tripsJsTree.deselect_all();
	tripsJsTree.select_node(tripsID);
	yourJsTree.deselect_all();
	yourJsTree.select_node(yourID);
	break;
      case 'role':
        addRemRoleMapping('add',
	    $('#' + tripsID), $('#' + yourID),
	    draggedLine);
	selectLi($('#' + tripsID)[0]);
	selectLi($('#' + yourID)[0]);
	break;
      default:
        throw new Error('WTF');
    }
    endDragging();
    return false;
  }

  function mouseDownOnHandle(evt) {
    //console.log('mouseDownOnHandle');
    // begin dragging mapping
    dragging = true;
    dragFromHandleID = $(this).attr('id');
    var handlesGID = $(this).parent().attr('id');
    var fields = handlesGID.split(/-/);
    dragFromSide = fields[0];
    draggedSide = (dragFromSide === 'trips' ? '2' : '1');
    dragFromConceptOrRole = fields[1];
    draggedLine = $(document.createElementNS(svgNS, 'line'));
    var pos = dragPositionInSVG(evt);
    draggedLine.attr('x1', pos.x);
    draggedLine.attr('y1', pos.y);
    draggedLine.attr('x2', pos.x);
    draggedLine.attr('y2', pos.y);
    draggedLine.attr(dragFromSide + '-handle', dragFromHandleID);
    $('#' + dragFromConceptOrRole + '-lines').append(draggedLine);
    selectLi(draggedLine[0]);
    $(document.body).on('mousemove', mouseMoveWhileDragging);
    $(document.body).on('mouseup', mouseUpWhileDragging);
  }

  // prevent Firefox from interfering with its own drags
  $('svg').on('dragstart', false);

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
	  updateMap('trips', 'concept', { openClose: true });
	});
      }).
      fail(function(jqXHR, textStatus, errorThrown) {
	console.log({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
      });
  });

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
  window.yourOntByName = {};
  window.yourOntById = {};

  $('#your-tree').on('loaded.jstree', function() {
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
	  var roleRestrMap = $.extend(true, { paths: [] }, newRoleRestrMap);
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

  /* call applyInheritance if necessary */
  function ensureInheritance(concept) {
    if (!('dynamic_sem_frame' in concept)) {
      var sem_feats = {};
      var sem_frame = [];
      applyInheritance(concept, sem_feats, sem_frame);
      concept.dynamic_sem_feats = sem_feats;
      concept.dynamic_sem_frame = sem_frame;
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
      ensureInheritance(concept);
      var sem_feats = concept.dynamic_sem_feats;
      var sem_frame = concept.dynamic_sem_frame;
      // TODO sem_feats?
      var template = clearUlUpToTemplate($('#trips-roles'));
      sem_frame.forEach(function(roleRestrMap, roleIndex) {
	var li =
	  addLiBeforeTemplate($('#trips-roles'),
	    (roleRestrMap.added ? '.added' : '.original'));
	if (roleRestrMap.inherited) {
	  li.addClass('inherited');
	} else {
	  li.addClass('own');
	}
	if (roleRestrMap.added) {
	  li.children('select').first().
	    val(roleRestrMap.roles.replace(/^ont:/,''));
	} else {
	  li.prepend(formatRole(roleRestrMap));
	}
	roleRestrMap.paths.forEach(function(path) {
	  var typeLi = addLiBeforeTemplate(li.children('ul'));
	  typeLi.attr('id', typeLi.attr('id').replace(/template/, roleIndex));
	  typeLi.children('input').val(
	    path.map(function(step) {
	      return ((('role' in step) ? ':' + step.role + ' ' : '') +
	              (('fillerType' in step) ? step.fillerType : ''));
	    }).join(' ')
	  );
	});
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
      var concept = yourOntById[args.selected[0]];
      $('#your-concept-name').val(concept.name);
      $('#your-concept-comment').val(concept.comment);
      var ul = $('#your-roles')[0];
      clearUlUpToTemplate($(ul));
      concept.roles.forEach(function(role) {
	var newLi = addLiBeforeTemplate(ul);
	newLi.on('rem', remYourRole);
	$(newLi.children()[0]).val(role.name);
      });
      setTimeout(function() {
	updateMap('your', 'role', { openClose: true });
      }, 0);
      $('#your-words').val(concept.words.join(', '));
      ul = $('#your-examples')[0];
      clearUlUpToTemplate($(ul));
      concept.examples.forEach(function(example) {
	var newLi = addLiBeforeTemplate(ul);
	newLi.on('rem', remExample);
	$(newLi.children()[0]).val(example);
      });
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

  $('#your-tree').on('move_node.jstree', function(evt, args) {
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

  window.selectRole = function(li) {
    selectLi(li);
    // select only the mapping between the selected roles if it exists
    var tripsLi = selectedLi($('#trips-roles'));
    var yourLi = selectedLi($('#your-roles'));
    var line = $('#' + tripsLi.attr('id') + '__to__' + yourLi.attr('id'));
    deselectAllLis($('#role-lines'));
    selectLi(line);
    return true;
  };

  $(window).resize(function(evt) {
    // update all the things
    updateMap('trips', 'concept', { scroll: true, openClose: true });
    updateMap('trips', 'role',    { scroll: true, openClose: true });
    updateMap('your',  'concept', { scroll: true, openClose: true });
    updateMap('your',  'role',    { scroll: true, openClose: true });
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
    if (search in yourOntByName) {
      var id = yourOntByName[search].id;
      yourJsTree.deselect_all();
      yourJsTree.select_node(id);
      $('#' + id)[0].scrollIntoView(true);
    } else {
      alert(search + ' not found');
    }
  });

  $('#rem-concept').on('click', function() {
    var treeNodes = yourJsTree.get_selected(true);
    yourJsTree.delete_node(treeNodes);
    treeNodes.forEach(function(node) {
      var concept = yourOntById[node.id];
      delete yourOntById[node.id];
      delete yourOntByName[concept.name];
    });
    setTimeout(function() {
      updateMap('your', 'concept', { openClose: true });
    }, 0);
    $('#your-details').hide();
  });

  $('#add-concept').on('click', function() {
    var concept = {
      name: '',
      comment: '',
      roles: [],
      words: [],
      examples: [],
      conceptMappings: [],
      roleMappings: []
    };
    var newNodeID = yourJsTree.create_node(null, '(new concept)');
    concept.id = newNodeID;
    yourOntById[newNodeID] = concept;
    yourJsTree.deselect_all();
    yourJsTree.select_node(newNodeID);
    setTimeout(function() {
      $('#your-concept-name').focus();
      updateMap('your', 'concept', { openClose: true });
    }, 0);
  });

  function addConceptMapping(tripsConcept, yourConcept, line) {
    if (line === undefined) {
      line = addLine($('#concept-lines'), 'ont__' + tripsConcept.name, yourConcept.id);
    }
    var mapping = {
      tripsConcept: tripsConcept,
      yourConcept: yourConcept,
      line: line
    };
    yourConcept.conceptMappings.push(mapping);
    return mapping;
  }

  function remConceptMapping(tripsConcept, yourConcept) {
    var i =
      yourConcept.conceptMappings.findIndex(function(m) {
	return tripsConcept === m.tripsConcept;
      });
    if (i < 0) { throw new Error('WTF'); }
    var mapping = yourConcept.conceptMappings.splice(i, 1)[0];
    mapping.line.remove();
  }

  $('#add-concept-mapping, #rem-concept-mapping').on('click', function(evt) {
    var tripsIDs = tripsJsTree.get_selected();
    var yourIDs = yourJsTree.get_selected();
    if (tripsIDs.length != 1 || yourIDs.length != 1) {
      alert('Select one TRIPS concept and one of your concepts before clicking the add/remove mapping buttons.');
      return;
    }
    var tripsID = tripsIDs[0];
    var yourID = yourIDs[0];
    var tripsConcept = tripsOnt[tripsID.replace(/^ont__/,'')];
    var yourConcept = yourOntById[yourID];
    if (/^add-/.test(this.id)) {
      var mapping = addConceptMapping(tripsConcept, yourConcept);
      selectLi(mapping.line[0]);
    } else {
      remConceptMapping(tripsConcept, yourConcept);
    }
  });

  function addRemRoleMapping(addOrRem, tripsLIs, yourLIs, line) {
    var tripsConceptID = tripsJsTree.get_selected()[0];
    var tripsConcept = tripsOnt[tripsConceptID.replace(/^ont__/,'')];
    var tripsRole;
    var tripsRolePath;
    var up = tripsLIs.parent().parent();
    if (up[0].tagName === 'LI') {
      tripsRole = tripsConcept.dynamic_sem_frame[up.index()];
      tripsRolePath = tripsRole.paths[tripsLIs.index()];
    } else {
      tripsRole = tripsConcept.dynamic_sem_frame[tripsLIs.index()];
    }
    var yourConceptID = yourJsTree.get_selected()[0];
    var yourConcept = yourOntById[yourConceptID];
    var yourRole = yourConcept.roles[yourLIs.index()];
    switch (addOrRem) {
      case 'add':
        if (line === undefined) {
	  line = addLine($('#role-lines'), tripsLIs[0].id, yourLIs[0].id);
	}
	var mapping = {
	  tripsConcept: tripsConcept,
	  tripsRole: tripsRole,
	  yourConcept: yourConcept,
	  yourRole: yourRole,
	  line: line
	};
	if (tripsRolePath !== undefined) {
	  mapping.tripsRolePath = tripsRolePath;
	}
	yourConcept.roleMappings.push(mapping);
	return mapping;
      case 'rem':
	var i =
	  yourConcept.roleMappings.findIndex(function(m) {
	    return (tripsConcept === m.tripsConcept &&
		    tripsRole === m.tripsRole &&
		    tripsRolePath === m.tripsRolePath &&
		    yourRole === m.yourRole);
	  });
	if (i < 0) { throw new Error('WTF'); }
	var mapping = yourConcept.roleMappings.splice(i, 1)[0];
	mapping.line.remove();
	return mapping;
      default:
        throw new Error('WTF');
    }
  }

  $('#add-role-mapping, #rem-role-mapping').on('click', function(evt) {
    var tripsLIs = selectedLi($('#trips-roles'));
    var yourLIs = selectedLi($('#your-roles'));
    if (tripsLIs.length != 1 || yourLIs.length != 1) {
      alert('Select a TRIPS role and one of your roles before clicking the add/remove mapping buttons.');
      return;
    }
    var mapping =
      addRemRoleMapping(this.id.replace(/-.*/,''), tripsLIs, yourLIs);
    if (/^add-/.test(this.id)) {
      selectLi(mapping.line[0]);
    }
  });

  $('#add-trips-role, #add-your-role, #add-example, #rem-trips-role, #rem-your-role, #rem-example').on('click', function(evt) {
    var ul = evt.target.parentNode.parentNode;
    if (/^add-/.test(this.id)) {
      var newLi =
        addLiBeforeTemplate(ul,
	    (this.id === 'add-trips-role' ? '.added' : undefined));
      if ('add-trips-role' == this.id) {
        newLi.on('rem', remTripsRole);
      } else if ('add-your-role' == this.id) {
	newLi.on('rem', remYourRole);
      } else if ('add-example' == this.id) {
	newLi.on('rem', remExample);
      }
      selectLi(newLi[0]);
      newLi.children().first().focus();
    } else {
      // FIXME disallow removing non-extra TRIPS roles
      // TODO remove roleMappings from your ontology that use this role if this is #rem-*-role
      remLiBeforeTemplate(ul);
    }
    if (/-roles$/.test(ul.id)) {
      var side = (/^your-/.test(ul.id) ? 'your' : 'trips');
      setTimeout(function() {
	updateMap(side, 'role', { openClose: true });
      }, 0);
    }
  });

  window.addTripsRolePath = function(evt) {
    var ul = evt.currentTarget.parentNode.parentNode;
    var newLi = addLiBeforeTemplate(ul);
    var roleIndex = $(ul.parentNode).index();
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var role = concept.dynamic_sem_frame[roleIndex];
    role.paths.push([]);
    // add role index to ID (path index already taken care of above)
    newLi.attr('id', newLi.attr('id').replace(/template/, '' + roleIndex));
    evt.stopPropagation(); // don't select the whole role
    selectLi(newLi[0]);
    newLi.children('input').first().focus();
    updateMap('trips', 'role', { openClose: true });
  }

  function isTripsRoleName(name) {
    return $('#trips-role-template option').toArray().
	     some(function(o) { return name === o.text.replace(/^:/,''); });
  }

  window.changeTripsRolePath = function(evt) {
    var input = evt.currentTarget;
    var roleIndex = $(input.parentNode.parentNode.parentNode).index();
    var pathIndex = $(input.parentNode).index();
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var role = concept.dynamic_sem_frame[roleIndex];
    try {
      var values = input.value.toLowerCase().split(/[,\s]+/);
      var newPath = [];
      var lastStep = {};
      newPath.push(lastStep);
      values.forEach(function(v) {
	if (/^:/.test(v)) { // role
	  lastStep = { role: v.replace(/^:/,'') };
	  if (!isTripsRoleName(lastStep.role)) {
	    throw 'Not a trips role name: :' + lastStep.role;
	  }
	  newPath.push(lastStep);
	} else { // concept
	  var fillerType = v.replace(/^ont::/,'');
	  if ('fillerType' in lastStep) {
	    throw 'Missing role name between ' + lastStep.fillerType + ' and ' + fillerType;
	  }
	  if (!(fillerType in tripsOnt)) {
	    throw 'Not a trips concept name: ' + fillerType;
	  }
	  lastStep.fillerType = fillerType;
	}
      });
      // replace old path with newPath, but keep same Array object, in order to
      // preserve references
      var path = role.paths[pathIndex];
      path.splice.bind(path, 0, path.length).apply(path, newPath);
    } catch (e) {
      alert(e);
      setTimeout(function() { input.focus(); }, 0);
    }
  }

  window.remTripsRolePath = function(evt) {
    var oldLi = remLiBeforeTemplate(evt.currentTarget.parentNode.parentNode);
    var idFields = oldLi.split(/-/); // type-#-of-trips-role-#
    var roleIndex = parseInt(idFields[5]);
    var pathIndex = parseInt(idFields[1]);
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var role = concept.dynamic_sem_frame[roleIndex];
    if (role.paths[pathIndex] !== undefined) {
      if (pathIndex == role.paths.length - 1) {
	role.paths.pop();
	// TODO remove roleMappings from your ontology that use this
      } else {
	// FIXME splice instead, and adjust indexes in IDs
	role.paths[pathIndex] = undefined;
      }
    }
    updateMap('trips', 'role', { openClose: true });
  }

  /* trips roles onchange/rem handlers */

  window.inputTripsRoleName = function(evt) {
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var i = $(evt.currentTarget).parent().index();
    // TODO mark this roleRestrMap as an extra role, and add it with a selection box instead of a plain text li, in both '#trips-tree on changed.jstreee' and loadFromSavableRepresentation
    concept.dynamic_sem_frame[i] = {
      roles: 'ont:' + $(evt.currentTarget).val(),
      optional: true,
      added: true,
      paths: []
    };
  };

  function remTripsRole(evt) {
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var i = $(this).parent().index();
    if (concept.dynamic_sem_frame.length <= i) {
      // do nothing
    } else if (concept.dynamic_sem_frame.length == i+1) {
      concept.dynamic_sem_frame.pop();
    } else {
      // FIXME shift role li IDs
      concept.dynamic_sem_frame[i] = undefined;
    }
  }

  /* your details oninput/onchange/rem handlers */

  $('#your-concept-name').on('change', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var newName = $(this).val();
    if (newName in yourOntByName) {
      alert('There is already a concept in your ontology named ' + JSON.stringify(newName) + ".\nYou must rename that concept first if you want to change the name of this concept from " + JSON.stringify(concept.name) + ' to ' + JSON.stringify(newName) + '.');
      $(this).val(concept.name);
      yourJsTree.set_text(id, ('' == concept.name ? '(new concept)' : concept.name));
      return;
    }
    delete yourOntByName[concept.name];
    concept.name = newName;
    yourJsTree.set_text(id, concept.name);
    yourOntByName[concept.name] = concept;
  });

  $('#your-concept-name').on('input', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var newName = $(this).val();
    yourJsTree.set_text(id, newName);
  });

  $('#your-concept-comment').on('input', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    concept.comment = $(this).val();
  });

  window.inputYourRole = function(evt, key) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var i = $(evt.currentTarget).parent().index();
    var role = { name: '' };
    if (concept.roles.length <= i) {
      concept.roles[i] = role;
    } else {
      role = concept.roles[i];
    }
    role[key] = $(evt.currentTarget).val();
  };

  function remYourRole(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var i = $(this).parent().index();
    if (concept.roles.length <= i) {
      // do nothing
    } else if (concept.roles.length == i+1) {
      concept.roles.pop();
    } else {
      // FIXME shift role li IDs
      concept.roles[i] = undefined;
    }
  }

  $('#your-words').on('input', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    concept.words = $(this).val().trim().split(/\s*,\s*/);
  });

  window.inputYourExample = function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var i = $(evt.currentTarget).parent().index();
    concept.examples[i] = $(evt.currentTarget).val();
  };

  function remExample(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var i = $(this).parent().index();
    if (concept.examples.length <= i) {
      // do nothing
    } else if (concept.examples.length == i+1) {
      concept.examples.pop();
    } else {
      // FIXME shift example li IDs
      concept.examples[i] = undefined;
    }
  }

  /* Return a savable representation of your ontology and mappings */
  function savableRepresentation() {
    var ret = { ontologySaveDate: new Date() }; // hope nobody makes a concept named that
    for (var id in yourOntById) {
      var concept = yourOntById[id];
      var mappings = concept.conceptMappings.map(function(m) {
	return 'ont::' + m.tripsConcept.name;
      });
      var roles = concept.roles.map(function(r) {
	var mappings = [];
	concept.roleMappings.forEach(function(m) {
	  if (m.yourRole === r) {
	    var tripsRolePath = (m.tripsRolePath || [{}]);
	    mappings.push({
	      concept: 'ont::' + m.tripsConcept.name,
	      rolePath: tripsRolePath.map(function(step) {
		var repStep = {
		  role: (('role' in step) ? 'ont::' + step.role :
			  m.tripsRole.roles.split(/\s+/)[0])
		};
		if ('fillerType' in step) {
		  repStep.fillerType = 'ont::' + step.fillerType;
		}
		return repStep;
	      })
	    });
	  }
	});
	return Object.assign({ mappings: mappings }, r);
      });
      ret[concept.name] = {
	comment: concept.comment,
	mappings: mappings,
	roles: roles,
	words: concept.words,
	examples: concept.examples
      };
      var parentID = yourJsTree.get_parent(id);
      if (parentID != '#') { // not root
	ret[concept.name].parent = yourOntById[parentID].name;
      }
    }
    return ret;
  }

  function loadFromSavableRepresentation(rep) {
    var warnings = [];
    // make concepts and jsTree data nodes
    var newOntByName = {};
    var newOntById = {};
    var treeNodesByName = {};
    var treeNodeIndex = 1;
    for (var name in rep) {
      if (name === 'ontologySaveDate') { continue; }
      var repConcept = rep[name];
      try {
	function warn(str) { warnings.push(str); }
	function fail(str) { throw new Error(str); }
	treeNodesByName[name] = {
	  id: 'j1_' + (treeNodeIndex++),
	  text: name,
	  children: []
	};
	// sanity checks
	if ('string' !== typeof repConcept.comment) {
	  fail('expected comment to be a string');
	}
	if (!Array.isArray(repConcept.mappings)) {
	  fail('expected mappings to be an array');
	}
	if (!Array.isArray(repConcept.roles)) {
	  fail('expected roles to be an array');
	}
	if (!Array.isArray(repConcept.words)) {
	  fail('expected words to be an array');
	}
	if (!Array.isArray(repConcept.examples)) {
	  fail('expected examples to be an array');
	}
	var yourConcept = {
	  id: treeNodesByName[name].id,
	  name: name,
	  comment: repConcept.comment,
	  words: repConcept.words,
	  examples: repConcept.examples
	};
	var conceptMappings = [];
	repConcept.mappings.forEach(function(m) {
	  if (('string' !== typeof m) || !/^ont::/.test(m)) {
	    fail('expected concept mapping to be a string starting with ont::');
	  }
	  var tripsName = m.replace(/^ont::/,'');
	  if (tripsName in tripsOnt) {
	    conceptMappings.push({
	      yourConcept: yourConcept,
	      tripsConcept: tripsOnt[tripsName]
	    });
	  } else {
	    warn('your concept ' + name + ' has a mapping to a non-existent trips concept ' + tripsName + '; concept mapping deleted');
	  }
	});
	var roles = [];
	var roleMappings = [];
	repConcept.roles.forEach(function(r) {
	  if ('string' !== typeof r.name) {
	    fail('expected role name to be a string');
	  }
	  if (!Array.isArray(r.mappings)) {
	    fail('expected role mappings to be an array');
	  }
	  var yourRole = { name: r.name };
	  roles.push(yourRole);
	  //r.mappings.forEach(function(m) { // can't use continue :(
	  mapping: for (var i = 0; i < r.mappings.length; i++) {
	    var m = r.mappings[i];
	    if (('string' !== typeof m.concept) || !/^ont::/.test(m.concept)) {
	      fail('expected role mapping concept to be a string starting with ont::');
	    }
	    if (!Array.isArray(m.rolePath)) {
	      fail('expected role mapping rolePath to be an array');
	    }
	    if (m.rolePath.length < 1) {
	      fail('expected role mapping rolePath to have at least one element');
	    }
	    var tripsName = m.concept.replace(/^ont::/,'');
	    if (tripsName in tripsOnt) {
	      var tripsConcept = tripsOnt[tripsName];
	      ensureInheritance(tripsConcept);
	      var tripsRoleName = m.rolePath[0].role;
	      if (('string' !== typeof tripsRoleName) || !/^ont::/.test(tripsRoleName)) {
		fail('expected role mapping role to be a string starting with ont::');
	      }
	      var tripsRole =
		tripsConcept.dynamic_sem_frame.find(function(roleRestrMap) {
		  return tripsRoleName === roleRestrMap.roles.split(/\s+/)[0];
		});
	      if (tripsRole === undefined) {
		if (isTripsRoleName(tripsRoleName.replace(/^ont::/, ''))) {
		  tripsRole = { roles: tripsRoleName, optional: true, paths: [] };
		  tripsConcept.dynamic_sem_frame.push(tripsRole);
		} else {
		  warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a non-existent trips role ' + tripsRoleName + '; role mapping deleted');
		  continue; // prevents us from using forEach :(
		}
	      }
	      var newMapping = {
		tripsConcept: tripsConcept,
		tripsRole: tripsRole,
		yourConcept: yourConcept,
		yourRole: yourRole
	      };
	      if (m.rolePath.length > 1 || ('fillerType' in m.rolePath[0])) {
		var newPath = [];
		//m.rolePath.forEach(function(step, j) { // still need continue
		for (var j = 0; j < m.rolePath.length; j++) {
		  if (j != 0 || ('fillerType' in step)) {
		    var newStep = {};
		    if (j != 0) {
		      if (('string' !== typeof step.role) || !/^ont::/.test(step.role)) {
			fail('expected role mapping role to be a string starting with ont::');
		      }
		      newStep.role = step.role.replace(/^ont::/,'');
		      if (!isTripsRoleName(newStep.role)) {
			warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a non-existent trips role ' + newStep.role + '; role mapping deleted');
			continue mapping;
		      }
		    }
		    if ('fillerType' in step) {
		      if (('string' !== typeof step.fillerType) || !/^ont::/.test(step.fillerType)) {
			fail('expected role mapping fillerType to be a string starting with ont::');
		      }
		      newStep.fillerType = step.fillerType.replace(/^ont::/,'');
		      if (!(newStep.fillerType in tripsOnt)) {
			warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a path using a non-existing trips concept ' + newStep.fillerType + '; role mapping deleted');
			continue mapping;
		      }
		    }
		    newPath.push(newStep);
		  }
		} //);
		var path =
		  tripsRole.paths.find(function(p) {
		    // my kingdom for a deepEqual
		    return p.every(function(step, j) {
		      return (step.role === newPath[j].role &&
			      step.fillerType === newPath[j].fillerType);
		    });
		  });
		if (path === undefined) {
		  tripsRole.paths.push(newPath);
		  path = newPath;
		}
		newMapping.tripsRolePath = path;
	      }
	      roleMappings.push(newMapping);
	    } else {
	      warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a non-existent trips concept ' + tripsName + '; role mapping deleted');
	    }
	  } //);
	});
	yourConcept.conceptMappings = conceptMappings;
	yourConcept.roles = roles;
	yourConcept.roleMappings = roleMappings;
	newOntByName[name] = yourConcept;
	newOntById[yourConcept.id] = yourConcept;
      } catch (e) {
	throw new Error(e.message + ' in ' + name + ': ' + JSON.stringify(repConcept));
      }
      if (warnings.length > 0) {
	alert("Warnings:\n" + warnings.join("\n"));
      }
    }
    // build the jsTree data
    var newJsTreeData = [];
    for (var name in rep) {
      if (name === 'ontologySaveDate') { continue; }
      var siblings =
        (('parent' in rep[name]) ?
	  treeNodesByName[rep[name].parent].children : newJsTreeData);
      siblings.push(treeNodesByName[name])
    }
    $('#your-tree').one('load_node.jstree', function() {
      updateMap('your', 'concept', { openClose: true });
    });
    yourJsTree.deselect_all();
    yourJsTree.settings.core.data = newJsTreeData;
    yourJsTree.refresh();
    yourOntByName = newOntByName;
    yourOntById = newOntById;
  }

  $('#save').on('click', function(evt) {
    // set the href of the file-output link to a data URI of JSON, and click it
    $('#file-output').attr('href',
      'data:application/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(savableRepresentation(), null, "\t"))
    // not sure why [0] is necessary, but it doesn't work without it
    )[0].click();
  });

  $('#load').on('click', function(evt) {
    $('#file-input')[0].click();
  });

  $('#file-input').on('change', function(evt) {
    var file = this.files[0];
    console.log('opening file ' + file.name);
    $('#file-output').attr('download', file.name); // save back to the same name
    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
	var rep = JSON.parse(evt.target.result);
	loadFromSavableRepresentation(rep);
      } catch (e) {
	alert('Error loading file ' + file.name + ': ' + e.message);
      }
    };
    reader.readAsText(file);
  });

  $('#trips-details').hide();
  $('#your-details').hide();
});
