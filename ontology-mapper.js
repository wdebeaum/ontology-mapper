$(function() {
  var DSL_DATA_PATH = 'dsl/';
  //var COLONS_OR_UNDERSCORE = '::'; // for original URCS files
  var COLONS_OR_UNDERSCORE = '_'; // for flaming-tyrion files

  /*
   * XSL transforms for making the TRIPS tree, etc.
   */

  function loadXSL(url, done) {
    var processor = null;
    if (window.XSLTProcessor) { // Gecko (Firefox), WebKit (Safari, Chrome)
      processor = new XSLTProcessor();
      $.ajax(url, { dataType: 'xml' }).
        done(function(data) {
	  // Safari doesn't do xsl:imports unless there is a frame associated
	  // with the transformed XML (which we don't have here), so we must
	  // do them manually
	  if (navigator.userAgent.indexOf("Safari") >= 0 &&
	      navigator.userAgent.indexOf("Chrome") < 0) {
	    var imports = $(data).find('import');
	    imports.remove();
	    var numImportsLeft = imports.length;
	    if (numImportsLeft == 0) {
	      // no imports, just do the main stylesheet
	      processor.importStylesheet(data);
	      done(processor);
	    } else { // have imports
	      imports.each(function(index, element) {
		var href = $(element).attr('href');
		$.ajax(href, { dataType: 'xml' }).
		  done(function(importData) {
		    // don't bother with recursive imports; we don't use them.
		    // can't call importStylesheet multiple times, have to
		    // instead insert the content of the imported stylesheet at
		    // the beginning of the main stylesheet
		    $(data.documentElement).prepend(
		      $(importData.documentElement).contents());
		    // serialize and then deserialize, because the actual DOM
		    // objects that we moved from one document to another are
		    // still contaminated by references to the old document
		    data =
		      (new DOMParser()).parseFromString(
		        (new XMLSerializer()).serializeToString(data),
			'text/xml'
		      );
		    numImportsLeft--;
		    if (numImportsLeft == 0) {
		      // finally import the main stylesheet
		      processor.importStylesheet(data);
		      done(processor);
		    }
		  }).
		  fail(function(jqXHR, textStatus, errorThrown) {
		    console.log('while processing <xsl:import href=' + JSON.stringify(href) + ' /> for Safari:');
		    console.log({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
		  });
	      });
	    }
	  } else { // sane browser
	    processor.importStylesheet(data);
	    done(processor);
	  }
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
  
  function evalAndLog(str) {
    console.log(str);
    return eval(str);
  }

  function xslTransformAndEval(proc, doc) {
    //console.log((new XMLSerializer()).serializeToString(doc));
    return eval/*AndLog*/('(' + (
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
	if (!Object.prototype.hasOwnProperty.call(treeNodes, parentName)) {
	  throw new Error('bogus parent of ont type ' + ontType + ': ' + parentName);
	}
	treeNodes[parentName].children.push(childNode);
      }
    }
    // return the root of the tree
    return treeNodes.root;
  }

  /*
   * managing list items
   */

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
    var selectedTemplate =
      $(ul).children('li.template' + (extraSelector || '')).first();
    var id = selectedTemplate.attr('id');
    var newLi = selectedTemplate.clone();
    newLi.removeClass('template');
    newLi.insertBefore(firstTemplate);
    newLi.attr('id', id.replace(/template/, '' + newLi.index()));
    return newLi;
  }

  /* Remove the li just before li.template, if any, and return it (or null). If
   * an isRemovable function is supplied, check that it returns true before
   * removing the li.
   */
  function remLiBeforeTemplate(ul, isRemovable) {
    var oldLi = $(ul).children('li.template').first().prev('li');
    if (oldLi.length == 0 ||
        (isRemovable !== undefined && !isRemovable(oldLi))) {
      return null; // no removable li
    } else { // have removable li
      oldLi.trigger('rem');
      oldLi.remove();
      return oldLi;
    }
  }

  function selectedLi(ul) {
    return ul.find('.selected');
  }

  /* Like remLiBeforeTemplate, except remove the selected li if there is one
   * (otherwise still remove the one before the template).
   */
  function remSelectedLi(ul, isRemovable) {
    var oldLi = $(ul).children('li.selected');
    if (oldLi.length == 0) { // nothing selected
      return remLiBeforeTemplate(ul, isRemovable); // fall back
    } else if (isRemovable !== undefined && !isRemovable(oldLi)) {
      return null; // not removable
    } else { // selected and removable
      oldLi.trigger('rem');
      oldLi.remove();
      return oldLi;
    }
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
    // if this is a line, point the corresponding use element at it, so that it
    // appears on top
    if (/-lines$/.test(ul.attr('id'))) {
      ul.next('use')[0].setAttributeNS("http://www.w3.org/1999/xlink", 'href', '#' + li.attr('id'));
    }
    return true;
  };

  /*
   * mapping lines and handles
   */

  /* Return the ID of the nearest visible ancestor of the given descendant node
   * in the given jsTree.
   */
  function visibleAncestorID(jsTree, descendantID) {
    if ($('#' + descendantID).length > 0) {
      return descendantID;
    } else {
      return visibleAncestorID(jsTree, jsTree.get_parent(descendantID));
    }
  }

  var svgNS = "http://www.w3.org/2000/svg";

  function addLine(linesG, tripsID, yourID, hidden) {
    //console.log({ fn: 'addLine', linesG: linesG, tripsID: tripsID, yourID: yourID, hidden: hidden });
    var tripsHandle = $('#' + tripsID + '__handle');
    var yourHandle = $('#' + yourID + '__handle');
    var lineID = tripsID + '__to__' + yourID;
    var line = $('#' + lineID);
    if (line.length == 0) { // doesn't exist yet, create it
      line = $(document.createElementNS(svgNS, 'line'));
      var tripsScroll;
      var yourScroll;
      switch (linesG.attr('id')) {
	case 'concept-lines':
	  tripsScroll = $('#trips-tree-scroll').scrollTop();
	  yourScroll = $('#your-tree-scroll').scrollTop();
	  line.on('click', selectConceptMapping);
	  break;
	case 'role-lines':
	  tripsScroll = $('#trips-details').scrollTop();
	  yourScroll = $('#your-details').scrollTop();
	  line.on('click', selectRoleMapping);
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
      line.attr('id', lineID);
      if (hidden) { line.addClass('hidden'); }
      linesG.append(line);
    } else { // already exists, adjust class if necessary
      if (line.hasClass('hidden') && !hidden) {
	line.removeClass('hidden');
      }
    }
    return line;
  }

  function scrollLine(side, treeOrDetails, line) {
    var coord = ('trips' === side ? 'y1' : 'y2');
    var scroll = $('#' + side + '-' + ((treeOrDetails === 'tree') ? 'tree-scroll' : 'details')).scrollTop();
    var handle = $('#' + line.attr(side + '-handle'));
    line.attr(coord, parseInt(handle.attr('cy')) - scroll);
  }

  function updateHandles(side, conceptOrRole) {
    var mapWidth = $('.map')[0].offsetWidth - 1; // -1px for border
    var handlesG = $('#' + side + '-' + conceptOrRole + '-handles');
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
    handlesG.empty();
    for (var node = firstNode; !done(node); node = nextNode(node)) {
      var handle = $(document.createElementNS(svgNS, 'circle'));
      handle.attr('class', 'handle');
      handle.attr('r', '1ex');
      handle.attr('cx', ('trips' === side ? 0 : mapWidth));
      var nodeHeight =
	((node.firstElementChild === null) ?
	  // no element children means it's just this row
	  node.offsetHeight :
	  // element children means it could have child nodes underneath, so
	  // only take the height of the first element child
	  node.firstElementChild.offsetHeight);
      handle.attr('cy', node.offsetTop + nodeHeight/2);
      if (node.id) {
	handle.attr('id', node.id + '__handle');
      }
      // add .from-concept-mapping-N to handle if this is a nil path
      var fromConceptMappingsStr = $(node).attr('from-concept-mappings');
      if (fromConceptMappingsStr !== undefined) {
	var conceptMappingIndexes = fromConceptMappingsStr.split(/\s+/);
	if (conceptMappingIndexes.length === 1 &&
	    /\bnil$/i.test($(node).children('input').val())) {
	  handle.addClass('from-concept-mapping-' + conceptMappingIndexes[0]);
	}
      }
      handlesG.append(handle);
      handle.on('mousedown', mouseDownOnHandle);
      handle.on('mouseup', mouseUpOnHandle);
    }
  }

  /* Is tripsRole the same as roleMapping.tripsRole? */
  function isTripsRoleFromMapping(tripsRole, roleMapping) {
    return ((tripsRole === roleMapping.tripsRole) ||
	    tripsRole.roles.includes(roleMapping.tripsRole.roles[0]));
  }

  function updateMap(side, conceptOrRole, opts) {
    if (!opts) { opts = {}; }
    if (opts.scroll) {
      var handlesG = $('#' + side + '-' + conceptOrRole + '-handles');
      var scroll =
          $('#' + side + '-' +
		  (('concept' === conceptOrRole) ? 'tree-scroll' : 'details')
	  ).scrollTop();
      handlesG.attr('transform', 'translate(0, ' + (-scroll) + ')');
    }
    if (opts.openClose) {
      if (opts.bothSidesHandles) {
	updateHandles('trips', conceptOrRole);
	updateHandles('your', conceptOrRole);
      } else {
	updateHandles(side, conceptOrRole);
      }
    }
    var linesG = $('#' + conceptOrRole + '-lines');
    if (opts.openClose) {
      linesG.empty();
      // if a pair of single concepts is selected, fill selected with an object
      // full of common vars (to protect them from being overwritten by other
      // uses thereof)
      var selected;
      var tripsIDs = tripsJsTree.get_selected();
      var yourIDs = yourJsTree.get_selected();
      if (tripsIDs.length == 1 && yourIDs.length == 1) {
	selected = {
	  tripsID: tripsIDs[0],
	  yourID: yourIDs[0]
	};
	selected.tripsConcept = tripsOnt[selected.tripsID.replace(/^ont__/,'')];
	selected.yourConcept = yourOntById[selected.yourID];
	// NOTE: this may still be undefined if there are no concept mappings
	// for this pair of concepts
	selected.conceptMapping =
	  selectedConceptMapping(selected.tripsConcept, selected.yourConcept);
      }
      switch (conceptOrRole) {
	case 'concept':
	  for (var yourID in yourOntById) {
	    var yourConcept = yourOntById[yourID];
	    var yourVisibleAncestorID = visibleAncestorID(yourJsTree, yourID);
	    var yourHandle = $('#' + yourVisibleAncestorID + '__handle');
	    // map from trips concept name to line we already made from that
	    // concept to yourConcept
	    var lineFrom = {};
	    yourConcept.conceptMappings.forEach(function(m) {
	      m.lines = [];
	      m.tripsConcepts.forEach(function(tc) {
		if (!Object.prototype.hasOwnProperty.call(lineFrom, tc.name)) {
		  var tripsID = 'ont__' + tc.name;
		  var tripsVisibleAncestorID =
		    visibleAncestorID(tripsJsTree, tripsID);
		  var tripsHandle = $('#' + tripsVisibleAncestorID + '__handle');
		  var hidden =
		    (yourID !== yourVisibleAncestorID ||
		     tripsID !== tripsVisibleAncestorID);
		  var line =
		    addLine(linesG,
			    tripsVisibleAncestorID, yourVisibleAncestorID,
			    hidden);
		  if (tripsJsTree.is_selected(tripsVisibleAncestorID) &&
		      yourJsTree.is_selected(yourVisibleAncestorID)) {
		    line.addClass('selected');
		  }
		  lineFrom[tc.name] = line;
		}
		m.lines.push(lineFrom[tc.name]);
	      });
	    });
	  }
	  // if exactly one node is selected on the opposite side, call
	  // updateWordCounts(side, that node's concept)
	  var oppositeSide = ((side === 'trips') ? 'your' : 'trips');
	  var oppositeSelectedIDs =
	    window[oppositeSide + 'JsTree'].get_selected();
	  if (oppositeSelectedIDs.length === 1) {
	    switch (side) {
	      case 'trips':
	        // on the trips side, we need to look up words first
	        lookupAndUpdateWordCounts(yourOntById[oppositeSelectedIDs[0]]);
		break;
	      case 'your':
	        updateWordCounts(side, tripsOnt[oppositeSelectedIDs[0].replace(/^ont__/, '')]);
		break;
	      default:
	        throw new Error('WTF');
	    }
	  } else { // not exactly one opposite node selected
	    // just add blank lis so we still get the stripes
	    var ul = $('#' + side + '-word-counts');
	    ul.empty();
	    $('#' + side + '-tree li').each(function() {
	      ul.append($('<li>'));
	    });
	  }
	  break;
	case 'role':
	  var conceptLine;
	  if (selected !== undefined) {
	    var conceptMappingIndex = 0;
	    selected.yourConcept.conceptMappings.
	    forEach(function(conceptMapping) {
	      if (conceptMapping.tripsConcepts.
		  includes(selected.tripsConcept)) {
		var lineClass = 'from-concept-mapping-' + conceptMappingIndex;
		conceptMappingIndex++;
		conceptLine =
		  $('#' + selected.tripsID + '__to__' + selected.yourID);
		selectLi(conceptLine);
		conceptMapping.roleMappings.forEach(function(m) {
		  var tripsRoleIndex =
		    selected.tripsConcept.dynamic_sem_frame.
		    findIndex(function(tripsRole) {
		      return isTripsRoleFromMapping(tripsRole, m);
		    });
		  if (tripsRoleIndex < 0) {
		    throw new Error('WTF');
		  }
		  var tripsRole =
		    selected.tripsConcept.dynamic_sem_frame[tripsRoleIndex];
		  var yourRoleIndex =
		    (('yourRole' in m) ?
		      selected.yourConcept.roles.findIndex(function(r) {
			return r.name === m.yourRole.name;
		      })
		      : -1);
		  var tripsRoleID = 'trips-role-' + tripsRoleIndex;
		  if (m.tripsRolePath) {
		    var tripsRolePathIndex =
		      tripsRole.paths.findIndex(function(path) {
			return path === m.tripsRolePath;
		      });
		    if (tripsRolePathIndex < 0) {
		      throw new Error('WTF');
		    }
		    tripsRoleID =
		      'path-' + tripsRolePathIndex + '-of-' + tripsRoleID;
		  }
		  if (yourRoleIndex >= 0) {
		    var yourRoleID = 'your-role-' + yourRoleIndex;
		    if (m.yourRoleFiller) {
		      var yourRole = selected.yourConcept.roles[yourRoleIndex];
		      var yourRoleFillerIndex =
		        yourRole.fillers.indexOf(m.yourRoleFiller);
		      if (yourRoleFillerIndex < 0) {
			throw new Error('WTF');
		      }
		      yourRoleID =
		        'filler-' + yourRoleFillerIndex + '-of-' + yourRoleID;
		    }
		    m.line = addLine(linesG, tripsRoleID, yourRoleID);
		    m.line.addClass(lineClass);
		    // if this role mapping is marked optional, and it's either
		    // part of the selected concept mapping, or there are no
		    // other role mappings in other concept mappings that are
		    // identical to this role mapping except not marked
		    // optional, then add the 'optional' class to the line
		    if (m.optional &&
		        (conceptMapping === selected.conceptMapping ||
			 ! selected.yourConcept.conceptMappings.
			   some(function(cm) {
			     return (
			       cm !== conceptMapping &&
			       cm.tripsConcepts.
			       includes(selected.tripsConcept) &&
			       cm.roleMappings.some(function(rm) {
				 return (
				   (!rm.optional) &&
				   isTripsRoleFromMapping(tripsRole, rm) &&
				   m.tripsRolePath === rm.tripsRolePath &&
				   m.yourRole.name === rm.yourRole.name &&
				   m.yourRoleFiller === rm.yourRoleFiller
				 );
			       })
			     );
			   })
			 )) {
		      m.line.addClass('optional');
		    }
		    if ($('#' + tripsRoleID).hasClass('selected') &&
		        $('#' + yourRoleID).hasClass('selected')) {
		      m.line.addClass('selected');
		    }
		  }
		});
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
      // if there is a concept mapping selected, also show other mapped TRIPS
      // concepts with selected mapping lines, and move any role mapping lines
      // for it to the front
      if (selected !== undefined && selected.conceptMapping !== undefined) {
	selected.conceptMapping.tripsConcepts.forEach(function(tc) {
	  $('#ont__' + tc.name + '__to__' + selected.yourID).
	  addClass('selected');
	});
	raiseRoleMappingLines();
      }
    } else if (opts.scroll) {
      linesG.children().each(function(i, line) {
	scrollLine(side, ('concept' === conceptOrRole ? 'tree' : 'details'), $(line));
      });
    }
  }

  /*
   * dragging mapping lines
   */

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
    var tripsID = (dragFromSide === 'trips' ? dragFromHandleID : dragToHandleID).replace(/__handle$/,'');
    var yourID = (dragToSide === 'trips' ? dragFromHandleID : dragToHandleID).replace(/__handle$/,'');
    // just delete the line and let the add*() call below add it again
    draggedLine.remove();
    switch (dragFromConceptOrRole) {
      case 'concept':
	tripsJsTree.deselect_all();
	tripsJsTree.select_node(tripsID);
	yourJsTree.deselect_all();
	yourJsTree.select_node(yourID);
	addConceptMapping(
	    tripsOnt[tripsID.replace(/^ont__/,'')], yourOntById[yourID]);
	break;
      case 'role':
	selectLi($('#' + tripsID)[0]);
	selectLi($('#' + yourID)[0]);
	addRemRoleMapping('add', $('#' + tripsID), $('#' + yourID));
	break;
      default:
        throw new Error('WTF');
    }
    // select the new added (not dragged) line
    selectLi($('#' + tripsID + '__to__' + yourID)[0]);
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
    if (dragFromConceptOrRole == 'role' &&
        $('#role-mapping-optional').prop('checked')) {
      draggedLine.addClass('optional');
    }
    selectLi(draggedLine[0]);
    $(document.body).on('mousemove', mouseMoveWhileDragging);
    $(document.body).on('mouseup', mouseUpWhileDragging);
  }

  // prevent Firefox from interfering with its own drags
  $('svg').on('dragstart', false);

  /*
   * clicking mapping lines
   */

  /* Return the list of names of (non-strict) ancestors of descendantConcept,
   * in order from root to descendant.
   */
  function ancestors(side, descendantConcept) {
    var tree;
    var id;
    switch (side) {
      case 'trips':
        tree = tripsJsTree;
	id = 'ont__' + descendantConcept.name;
	break;
      case 'your':
        tree = yourJsTree;
	id = descendantConcept.id;
	break;
      default: throw new Error('WTF');
    }
    return tree.get_path(id);
  }

  /* Does ancestorConcept subsume descendantConcept? */
  function subsumes(side, ancestorConcept, descendantConcept) {
    return ancestors(side, descendantConcept).includes(ancestorConcept.name);
  }

  /* Return the concept that subsumes both a and b, but as few others as
   * possible.
   */
  function leastCommonSubsumer(side, a, b) {
    var aa = ancestors(side, a);
    var ba = ancestors(side, b);
    var i = 0;
    var ont;
    switch (side) {
      case 'trips':
        ont = tripsOnt;
	break;
      case 'your':
        ont = yourOntByName;
	break;
      default: throw new Error('WTF');
    }
    for(;; i++) {
      if (i >= aa.length || aa[i] != ba[i]) {
	return ont[aa[i-1]];
	break;
      } else if (i >= ba.length) {
	return ont[ba[i-1]];
      }
    }
    throw new Error('WTF');
  }

  /* Given a pair of concepts linked by a grey mapping line, find concept
   * mappings between concepts under that pair on both sides, and return:
   * - [undefined, undefined, false], if there are no such mappings;
   * - [tripsMapped, yourMapped, false], the pair of concepts under those two
   *   that are actually mapped, if there is only one such pair;
   * - [tripsLCS, yourLCS, true], if there is more than one, where the LCSs are
   *   the least common subsumer concepts of all the mappings under the
   *   original pair.
   * The first call should omit the last two arguments, they're only used for
   * recursive calls.
   */
  function onlyMappingUnder(tripsConcept, yourConcept, tripsLCS, yourLCS) {
    var isLCS = false;
    // check the mappings for yourConcept
    for (var i = 0; i < yourConcept.conceptMappings.length; i++) {
      var cm = yourConcept.conceptMappings[i];
      for (var j = 0; j < cm.tripsConcepts.length; j++) {
	var tripsMapped = cm.tripsConcepts[j];
	if (!subsumes('trips', tripsConcept, tripsMapped)) {
	  continue;
	} else if (tripsLCS === undefined) {
	  tripsLCS = tripsMapped;
	  yourLCS = yourConcept;
	} else if (tripsMapped !== tripsLCS || yourConcept !== yourLCS) {
	  isLCS = true;
	  tripsLCS = leastCommonSubsumer('trips', tripsMapped, tripsLCS);
	  yourLCS = leastCommonSubsumer('your', yourConcept, yourLCS);
	}
      }
    }
    // check its descendants too
    var yourChildren =
      yourJsTree.get_json(yourConcept.id).children.map(function(child) {
	return yourOntById[child.id];
      });
    for (var i = 0; i < yourChildren.length; i++) {
      var sides = onlyMappingUnder(tripsConcept, yourChildren[i], tripsLCS, yourLCS);
      if (sides[2]) { isLCS = true; }
      tripsLCS = sides[0];
      yourLCS = sides[1];
    }
    return [tripsLCS, yourLCS, isLCS];
  }

  function selectConceptMapping(evt) {
    var line = $(this);
    var id = line.attr('id');
    var sides = id.split(/__to__/);
    // get the deeper mapping that this line represents, if there is only one
    var deepSides =
      onlyMappingUnder(
        tripsOnt[sides[0].replace(/^ont__/,'')],
	yourOntById[sides[1]]
      );
    console.log(deepSides);
    sides = [
      'ont__' + deepSides[0].name,
      deepSides[1].id
    ];
    // select each side and scroll it into view
    tripsJsTree.deselect_all();
    tripsJsTree.select_node(sides[0]);
    $('#' + sides[0])[0].scrollIntoView(true);
    yourJsTree.deselect_all();
    yourJsTree.select_node(sides[1]);
    $('#' + sides[1])[0].scrollIntoView(true);
    // also open each side down to the least common ancestor if we didn't get a
    // unique deeper mapping
    if (deepSides[2]) {
      tripsJsTree.open_node(sides[0]);
      yourJsTree.open_node(sides[1]);
    }
  }

  function selectRoleMapping(evt) {
    var line = $(this);
    var id = line.attr('id');
    var sides = id.split(/__to__/);
    selectRole($('#' + sides[0])[0]);
    selectRole($('#' + sides[1])[0]);
  }

  /*
   * word counts
   */

  /* Call the given async lookup function for each input, and then call done.
   * Ensure that each input has the function called on it exactly once, even if
   * queueLookup is called multiple times with some of the same inputs. Calls
   * spin(10) on each lookup, and finishSpinning() when done.
   *
   * The opts argument is an object with these properties:
   *
   * lookup(input, done) causes lookupStarted to return true when it starts,
   * and causes lookupFinished to return true when it finishes, just before
   * calling its done argument.
   *
   * lookupStarted(input) => bool
   *
   * lookupFinished(input) => bool
   *
   * onLookupFinished(input, fn) should cause fn to be called when input is
   * finished
   *
   * inputs is an array, and will be modified
   *
   * done()
   *
   * join() optional; defaults to a function that calls done() after being
   * called inputs.length times
   */
  function queueLookup(opts) {
    // set up join function if necessary
    if (opts.join === undefined) {
      // if we start out with no input, just finish immediately
      if (opts.inputs.length == 0) {
	opts.done();
	return;
      }
      var inputsLeft = opts.inputs.length;
      opts.join = function() {
	inputsLeft--;
	if (inputsLeft == 0) {
	  finishSpinning();
	  opts.done();
	}
      }
    }
    // eliminate inputs that have already started
    while (opts.inputs.length > 0 && opts.lookupStarted(opts.inputs[0])) {
      var input = opts.inputs.shift();
      // if it's already finished, join now
      if (opts.lookupFinished(input)) {
	opts.join();
      } else { // otherwise, join when it finishes
	opts.onLookupFinished(input, opts.join);
      }
    }
    if (opts.inputs.length > 0) {
      spin(10);
      // actually do lookup for one input.
      // when lookup is done, call queueLookup with the same opts again
      // (it's not infinite recursion because we're making opts.inputs smaller
      // each time)
      opts.lookup(opts.inputs.shift(), function() {
	opts.join();
	queueLookup(opts)
      });
    }
  }

  /* Return a version of array that is sorted and has duplicates removed (as if
   * run through unix "| sort | uniq").
   */
  function sortUniq(array) {
    // sort a copy
    var ret = [].concat(array).sort();
    // splice out runs of duplicates
    for (var i = 0; i < ret.length; i++) {
      var j;
      for (j = i + 1; j < ret.length; j++) {
	if (ret[i] !== ret[j]) {
	  break;
	}
      }
      if (j > i + 1) {
	ret.splice(i + 1, j - (i + 1));
      }
    }
    return ret;
  }

  function wordsDirectlyInConcept(side, concept) {
    var words = [];
    switch (side) {
      case 'trips':
        if ('senses' in concept && concept.senses !== null) {
          concept.senses.forEach(function(s) {
	    words.push(
	      s.word.
	      replace(/_/g,' ').
	      replace(/[()]/g,'').
	      replace(/\s+/g,' ').
	      trim()
	    );
	  });
	}
	if ('overlap' in concept) {
	  concept.overlap.forEach(function(sk) {
	    words.push(
	      sk.
	      replace(/%.*/,'').
	      replace(/_/g,' ')
	    );
	  });
	}
	break;
      case 'your':
        words = concept.words.map(function(w) {
	  return w.
	    replace(/_/g,' ').
	    replace(/\s+/g,' ').
	    trim();
	});
	break;
      default:
        throw new Error('WTF');
    }
    return sortUniq(words);
  }

  function wordsInConceptOrDescendants(side, concept) {
    var id = (side === 'trips' ? 'ont__' + concept.name : concept.id);
    var jsTree = window[side + 'JsTree'];
    var words = wordsDirectlyInConcept(side, concept);
    jsTree.get_node(id).children.forEach(function(childID) {
      var childWords = wordsInConceptOrDescendants(side,
        (side === 'trips' ?
	  tripsOnt[childID.replace(/^ont__/,'')] :
	  yourOntById[childID]));
      words = words.concat(childWords);
    });
    return sortUniq(words);
  }
  window.wordsDirectlyInConcept = wordsDirectlyInConcept;
  window.wordsInConceptOrDescendants = wordsInConceptOrDescendants;

  function updateWordCounts(side, oppositeConcept) {
    //console.log('updateWordCounts(' + side + ', ' + oppositeConcept.name + ')');
    var jsTree = window[side + 'JsTree'];
    var oppositeSide = ((side === 'trips') ? 'your' : 'trips');
    var oppositeJsTree = window[oppositeSide + 'JsTree'];
    var oppositeID =
      ((oppositeSide === 'trips') ?
        'ont__' + oppositeConcept.name : oppositeConcept.id);
    var oppositeWords =
      (oppositeJsTree.is_closed(oppositeID) ?
	// NOTE: we know we have all the words in the descendants even when
	// oppositeSide=='trips', because we either added them this session and
	// looked them up then, or we loaded a file, and we looked up all the
	// words from the file then. This lets us avoid looking up the entire
	// tree if someone selects ONT::root.
        wordsInConceptOrDescendants(oppositeSide, oppositeConcept) :
	// else, node is open or has no children
        wordsDirectlyInConcept(oppositeSide, oppositeConcept));
    var ul = $('#' + side + '-word-counts');
    ul.empty();
    var exactlyOneSelected = (jsTree.get_selected().length === 1);
    // iterate over visible nodes (see also updateMap)
    var firstNode = jsTree.element.children().children()[0]; // HACK
    var done = function(node) { return !node; };
    var nextNode = function(node) { return jsTree.get_next_dom(node)[0]; };
    for (var node = firstNode; !done(node); node = nextNode(node)) {
      var concept =
        ((side === 'trips') ?
	  tripsOnt[node.id.replace(/^ont__/,'')] :
	  yourOntById[node.id]);
      var words =
        (jsTree.is_closed(node.id) ?
	  wordsInConceptOrDescendants(side, concept) :
	  wordsDirectlyInConcept(side, concept));
      // find the intersection of words and oppositeWords
      var intersection =
	oppositeWords.filter(function(w) {
	  return words.includes(w);
	});
      var li = $('<li>');
      li.attr('id', node.id + '__word-count');
      if (intersection.length > 0) {
	li.text(intersection.length);
	li.attr('title', intersection.join(', '));
      }
      ul.append(li);
      // also update the opposite word count if this is the only selected node
      if (exactlyOneSelected && jsTree.is_selected(node)) {
	var oppositeLi = $('#' + oppositeID + '__word-count');
	if (intersection.length > 0) {
	  oppositeLi.text(intersection.length);
	  oppositeLi.attr('title', intersection.join(', '));
	} else {
	  oppositeLi.empty();
	  oppositeLi.removeAttr('title');
	}
      }
    }
  }

  var spinCount = 0;
  var spinIndex = 0;
  var spinChars =
  " ▏▎▍▌▋▊▉█▇▆▅▄▃▂▁";
  // "◧◩⬒⬔◨◪⬓⬕"; // half-filled box with spinning contents
  // "│╱─╲"; // Unicode spinning line
  // "|/-\\"; // ASCII spinning line
  function spin(maxCount) {
    $('#spinner').show();
    $('#layout').css('cursor', 'progress');
    spinCount++;
    if (spinCount > maxCount) {
      spinCount = 0;
      spinIndex++;
      if (spinIndex >= spinChars.length) {
	spinIndex = 0;
      }
      $('#spinner').text(spinChars[spinIndex]);
    }
  }

  function finishSpinning() {
    $('#spinner').hide();
    $('#layout').css('cursor', ''); // restore default cursor
  }

  /* Make sure that all TRIPS concepts that have senses of any of the given
   * words actually have those senses loaded into tripsOnt, and call the done()
   * callback once they do.
   */
  var wordsAlreadyLookedUp = {};
  function lookUpWords(words, done) {
    queueLookup({
      inputs: words,
      done: done,
      lookupStarted: function(word) {
	return Object.prototype.hasOwnProperty.call(wordsAlreadyLookedUp, word);
      },
      lookupFinished: function(word) {
	return wordsAlreadyLookedUp[word] == 'finished';
      },
      onLookupFinished: function(word, fn) {
	wordsAlreadyLookedUp[word].push(fn);
      },
      lookup: function(word, done) {
	wordsAlreadyLookedUp[word] = [];
	function doneWithThisWord() {
	  wordsAlreadyLookedUp[word].forEach(function(fn) { fn(); });
	  wordsAlreadyLookedUp[word] = 'finished';
	  done();
	}
	$.ajax({
	  url: DSL_DATA_PATH + '../data/' +
	       encodeURIComponent('W' + COLONS_OR_UNDERSCORE + word.replace(/\s+/, '_') + '.xml'),
	  dataType: 'xml'
	// on success, make sure each TRIPS concept named $name from <CLASS
	// onttype="$name"> has its senses loaded
	}).done(function(data) {
	  var ontTypes =
	    $(data).find('CLASS').toArray().map(
	      function(classElement) { return $(classElement).attr('onttype'); }
	    );
	  ensureSenses(ontTypes, doneWithThisWord);
	// on failure, just say we're done
	}).fail(doneWithThisWord);
      }
    });
  }

  var updateWordCountsTimeoutID;
  function lookupAndUpdateWordCounts(yourConcept) {
    // limit how often we do this, since it's an expensive enough operation
    // that we don't want to do it on each keystroke
    clearTimeout(updateWordCountsTimeoutID);
    updateWordCountsTimeoutID =
      setTimeout(function() {
	lookUpWords([].concat(yourConcept.words), function() {
	  updateWordCounts('trips', yourConcept);
	});
      }, 200); // milliseconds
  }

  /* Expand tree under concept until more than one now-visible descendant has
   * some of the given words under it, or zero not-yet-visible descendants do.
   * Scroll the lowest expanded node into view and return true if any were
   * expanded. Return false otherwise.
   */
  function expandUntilWords(tree, side, concept, words) {
    var conceptId = ((side == 'trips') ? 'ont__' + concept.name : concept.id);
    var children =
      tree.get_json(conceptId).children.map(function(child) {
	return ((side == 'trips') ?
	         tripsOnt[child.id.replace(/^ont__/,'')] :
		 yourOntById[child.id]);
      });
    var childToExpand = undefined;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var childWords = wordsInConceptOrDescendants(side, child);
      if (childWords.some(function(w) { return words.includes(w); })) {
	if (childToExpand === undefined) {
	  childToExpand = child;
	} else { // more than one childToExpand, we're done
	  var id = ((side == 'trips') ? 'ont__' + concept.name : concept.id);
	  // expand it
	  tree.open_node(id);
	  // select (only) it
	  tree.deselect_all();
	  tree.select_node(id);
	  // scroll so we can see it
	  $('#' + id)[0].scrollIntoView(true);
	  return true;
	}
      }
    }
    if (childToExpand !== undefined) {
      tree.open_node((side == 'trips') ? 'ont__' + concept.name : concept.id);
      if (!expandUntilWords(tree, side, childToExpand, words)) {
	// if we didn't expand anything further, select the child and scroll
	var childId = ((side == 'trips') ? 'ont__' + childToExpand.name : childToExpand.id);
	tree.deselect_all();
	tree.select_node(childId);
	$('#' + childId)[0].scrollIntoView(true);
      }
      return true;
    } else {
      return false;
    }
  }

  $('#trips-word-counts, #your-word-counts').on('click', function(evt) {
    var li = $(evt.target);
    var wordsStr = li.attr('title');
    if (wordsStr !== undefined) { // has counted words
      var words = wordsStr.split(/, /);
      var side = this.id.substr(0,this.id.indexOf('-'));
      var conceptId = li[0].id.replace(/__word-count$/,'');
      var concept =
        ((side == 'trips') ?
	  tripsOnt[conceptId.replace(/^ont__/,'')] :
	  yourOntById[conceptId]);
      var tree = window[side + 'JsTree'];
      expandUntilWords(tree, side, concept, words);
    }
  });

  /*
   * load trees
   */

  var jsTreeConfig = {
    core: {
      animation: false,
      themes: {
	icons: false,
	stripes: true
      },
    }
  };

  window.tripsTreeLoaded = false;
  window.yourTreeLoaded = false;

  var dslToJSON;
  loadXSL('dsl-to-json.xsl', function(dslToJSONarg) {
    dslToJSON = dslToJSONarg;
    $.ajax(DSL_DATA_PATH + 'trips-ont-dsl.xml', { dataType: 'xml' }).
      done(function(tripsOntDSL) {
	window.tripsOnt = xslTransformAndEval(dslToJSON, tripsOntDSL);
	setXSLParameter(dslToJSON, 'senses-only', true);
	for (var name in tripsOnt) {
	  tripsOnt[name].roleMappings = [];
	  if ('sem_frame' in tripsOnt[name]) {
	    // split roles strings into lists and strip off ont::
	    // (this is easier to do here than in XSL 1.0)
	    tripsOnt[name].sem_frame.forEach(function(roleRestrMap) {
	      roleRestrMap.roles =
	        roleRestrMap.roles.
		split(/\s+/).
		map(function(r) { return r.replace(/^ont::/,''); });
	    });
	  }
	}
	var tree = makeTripsOntTree(tripsOnt);
	$('#trips-tree').jstree(
	  $.extend(true, { core: { data: tree } }, jsTreeConfig)
	);
	window.tripsJsTree = $.jstree.reference('trips-tree');
	// update concept map once both trees are loaded
	$('#trips-tree').on('loaded.jstree', function() {
	  tripsTreeLoaded = true;
	  if (yourTreeLoaded) {
	    updateMap('trips', 'concept', { openClose: true });
	  } else {
	    $('#your-tree').one('loaded.jstree', function() {
	      updateMap('trips', 'concept', { openClose: true });
	    });
	  }
	});
	$('#trips-concept-search input').autocomplete({
	  minLength: 3,
	  source: Object.keys(tripsOnt),
	  select: function(evt, ui) {
	    setTimeout(function() {
	      tripsConceptSearch(evt.target.value);
	    }, 0);
	  }
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

  // update concept map once both trees are loaded
  $('#your-tree').on('loaded.jstree', function() {
    yourTreeLoaded = true;
    if (tripsTreeLoaded) {
      updateMap('your', 'concept', { openClose: true });
    } else {
      $('#trips-tree').one('loaded.jstree', function() {
	updateMap('your', 'concept', { openClose: true });
      });
    }
  });

  /*
   * TRIPS details display/inheritance
   */

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
	  if (!Object.prototype.hasOwnProperty.call(childFeats.features, k)) {
	    childFeats.features[k] = parentFeats.features[k];
	  }
	}
      } else {
	childFeats.features = $.extend(true, {}, parentFeats.features);
      }
    }
  }

  function applyTripsInheritance(concept, ancestor) {
    var justStarting = (ancestor === undefined);
    // if we're just starting, get rid of any old inherited stuff
    if (justStarting) {
      ancestor = concept;
      if ('dynamic_sem_frame' in concept) {
	// no need to bother with sem_feats, since it's not editable at all
	concept.dynamic_sem_frame =
	  concept.dynamic_sem_frame.filter(function(roleRestrMap) {
	    return !(roleRestrMap.inherited || roleRestrMap.added);
	  });
      } else {
	// shallow copy sem_frame
	concept.dynamic_sem_frame =
	  (('sem_frame' in concept) ? [].concat(concept.sem_frame) : []);
	// deep copy sem_feats in concept and within sem_frame
	concept.dynamic_sem_feats =
	  (('sem_feats' in concept) ?
	    $.extend(true, {}, concept.sem_feats) : {});
      }
      concept.dynamic_sem_frame.forEach(function(roleRestrMap) {
	if ('restriction' in roleRestrMap) {
	  if ('sem_feats' in roleRestrMap.restriction) {
	    roleRestrMap.restriction.dynamic_sem_feats =
	      $.extend(true, {}, roleRestrMap.restriction.sem_feats);
	  } else {
	    delete roleRestrMap.restriction;
	  }
	}
      });
    } else { // at an ancestor
      var ancestor_sem_frame;
      if ('dynamic_sem_frame' in ancestor) {
	ancestor_sem_frame = ancestor.dynamic_sem_frame;
      } else if ('sem_frame' in ancestor) {
	ancestor_sem_frame = ancestor.sem_frame;
      } else {
	ancestor_sem_frame = [];
      }
      ancestor_sem_frame.forEach(function(aRoleRestrMap) {
	if (!(aRoleRestrMap.inherited || aRoleRestrMap.added)) {
	  var cRoleRestrMap =
	    concept.dynamic_sem_frame.find(function(r) {
	      return r.roles.includes(aRoleRestrMap.roles[0]);
	    });
	  if (cRoleRestrMap === undefined) { // not overridden
	    cRoleRestrMap = {
	      __proto__: aRoleRestrMap,
	      inherited: true,
	      paths: []
	    };
	    if (('restriction' in cRoleRestrMap) &&
		!('dynamic_sem_feats' in cRoleRestrMap.restriction)) {
	      if ('sem_feats' in cRoleRestrMap.restriction) {
		cRoleRestrMap.restriction.dynamic_sem_feats =
		  $.extend(true, {}, cRoleRestrMap.restriction.sem_feats);
	      } else {
		cRoleRestrMap.restriction.dynamic_sem_feats = {};
	      }
	    }
	    concept.dynamic_sem_frame.push(cRoleRestrMap);
	  } else { // overridden
	    if (('restriction' in aRoleRestrMap) &&
	        ('sem_feats' in aRoleRestrMap.restriction)) {
	      if ('restriction' in cRoleRestrMap) {
		mergeFeats(cRoleRestrMap.restriction.dynamic_sem_feats,
			   aRoleRestrMap.restriction.sem_feats);
	      } else {
		cRoleRestrMap.restriction = {
		  dynamic_sem_feats:
		    $.extend(true, {}, aRoleRestrMap.restriction.sem_feats)
		};
	      }
	    }
	  }
	}
      });
    }
    // recurse on parent of ancestor
    var tripsParentID = tripsJsTree.get_parent('ont__' + ancestor.name);
    if (tripsParentID !== '#') {
      applyTripsInheritance(concept, tripsOnt[tripsParentID.replace(/^ont__/, '')]);
    }
  }

  function addRolesAndPathsFromAllMappings(concept) {
    concept.dynamic_sem_frame.forEach(function(roleRestrMap) {
      roleRestrMap.paths = [];
    });
    var yourIDs = yourJsTree.get_selected();
    if (yourIDs.length == 1) {
      var yourID = yourIDs[0];
      var yourConcept = yourOntById[yourID];
      // reset fromConceptMappings on all paths
      yourConcept.conceptMappings.forEach(function(conceptMapping) {
	conceptMapping.roleMappings.forEach(function(m) {
	  if ('tripsRolePath' in m) {
	    m.tripsRolePath.fromConceptMappings = {};
	  }
	});
      });
      var i = 0;
      yourConcept.conceptMappings.forEach(function(conceptMapping) {
	if (!conceptMapping.tripsConcepts.includes(concept)) {
	  return; // break
	}
	conceptMapping.roleMappings.forEach(function(m) {
	  var tripsRole =
	    concept.dynamic_sem_frame.
	    find(function(roleRestrMap) {
	      return isTripsRoleFromMapping(roleRestrMap, m);
	    });
	  if (tripsRole === undefined) {
	    concept.dynamic_sem_frame.push(m.tripsRole);
	    tripsRole = m.tripsRole;
	    m.tripsRole.paths = [];
	  }
	  if ('tripsRolePath' in m) {
	    m.tripsRolePath.fromConceptMappings[i] = true;
	    if (!tripsRole.paths.includes(m.tripsRolePath)) {
	      tripsRole.paths.push(m.tripsRolePath);
	    }
	  }
	});
	i++;
      });
    }
  }

  /* load words and examples if necessary, and then call done().
   * conceptNames may be an array of concept names, or a single concept name.
   */
  function ensureSenses(conceptNames, done) {
    if (!(conceptNames instanceof Array)) {
      conceptNames = [conceptNames];
    }
    var concepts =
      conceptNames.map(function(conceptName) {
	var concept = tripsOnt[conceptName];
	// filter out undefined TRIPS concepts, but continue anyway, because
	// some words in TRIPS are genuinely defined with "non-hierarchy-lf"s,
	// meaning their "class" is not an ONT type. I don't like it, but
	// that's how it is.
	if (concept === null || !('object' == typeof concept)) {
	  console.log('TRIPS concept name ' + conceptName +
		      ' led to bogus value:');
	  console.log(concept);
	  return undefined;
	}
	return concept;
      }).
      filter(function(concept) {
	return (concept !== undefined);
      });
    queueLookup({
      inputs: concepts,
      done: done,
      lookupStarted: function(concept) {
	return ('senses' in concept);
      },
      lookupFinished: function(concept) {
	return (concept.senses instanceof Array);
      },
      onLookupFinished: function(concept, fn) {
	concept.lookupListeners.push(fn);
      },
      lookup: function(concept, done) {
	concept.lookupListeners = [];
	concept.senses = null; // make lookupStarted return true
	$.ajax({
	  url: DSL_DATA_PATH +
	       encodeURIComponent(
		 'ONT' + COLONS_OR_UNDERSCORE + concept.name + '.xml'
	       ),
	  dataType: 'xml'
	}).
	done(function(conceptDSL) {
	  concept.senses = xslTransformAndEval(dslToJSON, conceptDSL);
	  concept.lookupListeners.forEach(function(fn) {
	    fn();
	  });
	  delete concept.lookupListeners;
	  done();
	}).
	fail(function(jqXHR, textStatus, errorThrown) {
	  console.log({ jqXHR: jqXHR, textStatus: textStatus, errorThrown: errorThrown });
	});
      }
    });
  }

  function formatMaybeDisj(x) {
    return '<b>' + x.replace(/ or /g, '</b> <i>or</i> <b>') + '</b>; ';
  }

  function formatFLType(inherit) {
    return 'fltype: ' + formatMaybeDisj(inherit);
  }

  function formatRole(roleRestrMap) {
    var roleNames = '<b>:' + roleRestrMap.roles[0] + '</b>';
    if (roleRestrMap.roles.length > 1) {
      roleNames +=
          ' <i>implements</i> ' +
          roleRestrMap.roles.
	  map(function(r) { return '<b>:' + r + '</b>'; }).
	  join(', ');
    }
    var optionality = (roleRestrMap.optional ? ' (<i>optional</i>) ' : ' ');
    var restriction = '';
    if ('restriction' in roleRestrMap) {
      var fltype = '';
      var feats = '';
      if ('dynamic_sem_feats' in roleRestrMap.restriction) {
	if ('inherit' in roleRestrMap.restriction.dynamic_sem_feats) {
	  fltype = formatFLType(roleRestrMap.restriction.dynamic_sem_feats.inherit);
	}
	if ('features' in roleRestrMap.restriction.dynamic_sem_feats) {
	  feats =
	    $.map(roleRestrMap.restriction.dynamic_sem_feats.features, function(v, k) {
	      return k + ': ' + formatMaybeDisj(v);
	    }).join('');
	}
      }
      if (fltype !== '' || feats !== '') {
	restriction = 'restricted to ' + fltype + feats;
      }
    }
    return roleNames + optionality + restriction;
  }

  function showOtherMappedTripsConcepts(tripsConcept) {
    var yourIDs = yourJsTree.get_selected();
    var val = '';
    if (yourIDs.length == 1) {
      var yourID = yourIDs[0];
      var yourConcept = yourOntById[yourID];
      var conceptMapping = selectedConceptMapping(tripsConcept, yourConcept);
      if (conceptMapping !== undefined) {
	val =
	  conceptMapping.tripsConcepts.
	  filter(function(tc) { return tc !== tripsConcept; }).
	  map(function(tc) { return tc.name; }).
	  join(' ');
      }
    }
    $('#other-mapped-trips-concepts').val(val);
  }

  function showTripsRoles(concept) {
    applyTripsInheritance(concept);
    addRolesAndPathsFromAllMappings(concept);
    showOtherMappedTripsConcepts(concept); // not roles, but whatever
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
	  val(':' + roleRestrMap.roles[0]);
	li.on('rem', remTripsRole);
      } else {
	li.prepend(formatRole(roleRestrMap));
      }
      roleRestrMap.paths.forEach(function(path) {
	var pathStr =
	  path.map(function(step) {
	    return ((('role' in step) ? ':' + step.role + ' ' : '') +
		    (('fillerType' in step) ? step.fillerType : ''));
	  }).join(' ');
	var pathLi;
	pathLi = addLiBeforeTemplate(li.children('ul'), '.own');
	pathLi.children('input').val(pathStr);
	var input = pathLi.children('input');
	input.autocomplete({
	  source: autocompleteTripsRolePath,
	  change: changeTripsRolePath
	});
	pathLi.attr('id', pathLi.attr('id').replace(/template/, roleIndex));
	pathLi.attr('from-concept-mappings', Object.keys(path.fromConceptMappings).join(' '));
      });
    });
  }

  $('#trips-tree').on('changed.jstree', function(evt, args) {
    if (args.selected.length == 1) {
      var name = tripsJsTree.get_text(args.selected[0]);
      $('#trips-concept-name').text(name);
      var concept = tripsOnt[name];
      var wnSpan = $('#trips-wn-mappings');
      wnSpan.empty();
      if ('overlap' in concept) {
	wnSpan.text(concept.overlap.join(', '));
      }
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
      updateSelectConceptMapping();
      // get rest of details from trips-ont-dsl.xml we already loaded
      $('#trips-concept-comment').text(concept.comment || '');
      showTripsRoles(concept);
      $('#trips-details').show();
      updateWordCounts('your', concept);
    } else {
      $('#select-concept-mapping').empty().selectmenu('refresh');
      $('#your-word-counts li').empty();
      clearUlUpToTemplate($('#trips-roles')); // so we don't re-add handles
      $('#trips-details').hide();
    }
    // let things render before updating map
    setTimeout(function() {
      updateMap('trips', 'role', { openClose: true });
    }, 0);
  });

  /*
   * your details display/inheritance
   */

  function applyYourInheritance(concept, ancestor) {
    // if we're just starting, get rid of any old inherited roles/mappings
    if (ancestor === undefined) {
      concept.roles =
        concept.roles.filter(function(r) { return !r.inherited; });
      ancestor = concept;
    } else { // at an ancestor
      // add the ancestor's new roles
      ancestor.roles.forEach(function(role) {
	if ((!role.inherited) && // don't trust ancestor's inherited roles
	    !concept.roles.find(function(r) { return r.name === role.name; })) {
	  // FIXME use __proto__ instead of Object.assign here?
	  concept.roles.push(
	      Object.assign({ inherited: true }, role, { fillers: [] }));
	}
      });
    }
    // recurse on parent of ancestor
    var yourParentID = yourJsTree.get_parent(ancestor.id);
    if (yourParentID !== '#') {
      applyYourInheritance(concept, yourOntById[yourParentID]);
    }
  }

  function showYourRoles(concept) {
    var ul = $('#your-roles')[0];
    clearUlUpToTemplate($(ul));
    if (concept.isSymbol) {
      $('#your-roles, #your-roles-dt').hide();
    } else {
      $('#your-roles, #your-roles-dt').show();
      applyYourInheritance(concept);
      concept.roles.forEach(function(role, roleIndex) {
	var newLi;
	if (role.inherited) {
	  var newLi = addLiBeforeTemplate(ul, '.inherited');
	  newLi.prepend(document.createTextNode(role.name));
	} else {
	  var newLi = addLiBeforeTemplate(ul, '.own');
	  newLi.on('rem', remYourRole);
	  $(newLi.children()[0]).val(role.name);
	  role.fillers.forEach(function(filler) {
	    var fillerLi = addLiBeforeTemplate(newLi.children('ul'), '.own');
	    fillerLi.children('input').val(filler.value);
	    fillerLi.attr('id',
		fillerLi.attr('id').replace(/template/, roleIndex));
	  });
	}
	newLi.find('input:checkbox')[0].checked = role.filledBySymbol;
	var fillerValuesUl = newLi.children('ul');
	if (role.filledBySymbol) {
	  fillerValuesUl.hide();
	} else {
	  fillerValuesUl.show();
	}
      });
    }
    setTimeout(function() {
      updateMap('your', 'role', { openClose: true });
    }, 0);
  }

  $('#your-tree').on('changed.jstree', function(evt, args) {
    // selection changed
    if (args.selected.length == 1) {
      var concept = yourOntById[args.selected[0]];
      updateSelectConceptMapping();
      $('#your-concept-name').val(concept.name);
      $('#your-concept-comment').val(concept.comment);
      $('#is-symbol')[0].checked = concept.isSymbol;
      showYourRoles(concept);
      $('#your-words').val(concept.words.join(', '));
      ul = $('#your-examples')[0];
      clearUlUpToTemplate($(ul));
      concept.examples.forEach(function(example) {
	var newLi = addLiBeforeTemplate(ul);
	newLi.on('rem', remExample);
	$(newLi.children()[0]).val(example);
      });
      $('#your-details').show();
      lookupAndUpdateWordCounts(concept);
    } else {
      $('#select-concept-mapping').empty().selectmenu('refresh');
      $('#trips-word-counts li').empty();
      clearUlUpToTemplate($('#your-roles')); // so we don't re-add handles
      $('#your-details').hide();
    }
    // re-show trips roles and remember to update both sides' handles, if
    // there's exactly one trips concept selected, in case there are extra
    // roles or paths that need to be added/removed because we selected a
    // different/no your concept, and thus a different concept mapping
    var bothSidesHandles = false;
    var tripsIDs = tripsJsTree.get_selected();
    if (tripsIDs.length == 1) {
      showTripsRoles(tripsOnt[tripsIDs[0].replace(/^ont__/, '')]);
      bothSidesHandles = true;
    }
    updateMap('your', 'role', {
      openClose: true,
      bothSidesHandles: bothSidesHandles
    });
  });

  /*
   * handlers for days
   */

  $('#trips-tree').on('after_open.jstree after_close.jstree', function(evt) {
    updateMap('trips', 'concept', { openClose: true });
    return true;
  });

  $('#your-tree').on('after_open.jstree after_close.jstree', function(evt) {
    updateMap('your', 'concept', { openClose: true });
    return true;
  });

  $('#your-tree').on('move_node.jstree', function(evt, args) {
    var selectedIDs = yourJsTree.get_selected();
    if (selectedIDs.length === 1) {
      showYourRoles(yourOntById[selectedIDs[0]]);
    }
    updateMap('your', 'concept', { openClose: true });
    return true;
  });

  $('#trips-tree-scroll').on('scroll', function(evt) {
    updateMap('trips', 'concept', { scroll: true });
    return true;
  });

  $('#your-tree-scroll').on('scroll', function(evt) {
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
    $('#role-mapping-optional').prop('checked', line.hasClass('optional'));
    return true;
  };

  $('#role-mapping-optional').on('change', function(evt) {
    var line = selectedLi($('#role-lines'));
    if (line.length == 1) {
      // find the roleMapping object corresponding to this line
      var ids = line.attr('id').split(/__to__/);
      if (ids.length != 2) {
	throw new Error('WTF: ' + JSON.stringify(line.attr('id')));
      }
      var tripsID = ids[0];
      var tripsFields = tripsID.split(/-/);
      //  0    1 2   3     4    5
      //             0     1    2
      // (path-A-of-)trips-role-B
      var pathIndex;
      if (tripsFields.length == 6) {
	tripsFields.shift(); // path
	pathIndex = parseInt(tripsFields.shift(), 10);
	tripsFields.shift(); // of
      }
      if (tripsFields.length != 3) {
	throw new Error('WTF: ' + JSON.stringify(tripsID));
      }
      var tripsRoleIndex = parseInt(tripsFields[2], 10);
      var yourID = ids[1];
      var yourFields = yourID.split(/-/);
      //  0      1 2   3    4    5
      //               0    1    2
      // (filler-A-of-)your-role-B
      var fillerIndex;
      if (yourFields.length == 6) {
	yourFields.shift(); // filler
	fillerIndex = parseInt(yourFields.shift(), 10);
	yourFields.shift(); // of
      }
      if (yourFields.length != 3) {
	throw new Error('WTF: ' + JSON.stringify(yourID));
      }
      var yourRoleIndex = parseInt(yourFields[2], 10);
      var tripsConcept = tripsOnt[tripsJsTree.get_selected()[0].replace(/^ont__/, '')]
      var yourConcept = yourOntById[yourJsTree.get_selected()[0]];
      var tripsRole = tripsConcept.dynamic_sem_frame[tripsRoleIndex];
      var yourRole = yourConcept.roles[yourRoleIndex];
      var tripsRolePath;
      if (pathIndex !== undefined) {
	tripsRolePath = tripsRole.paths[pathIndex];
      }
      var yourRoleFiller;
      if (fillerIndex !== undefined) {
	yourRoleFiller = yourRole.fillers[fillerIndex];
      }
      var conceptMapping = selectedConceptMapping(tripsConcept, yourConcept, 'error');
      var roleMapping =
        conceptMapping.roleMappings.find(function(m) {
	  return (isTripsRoleFromMapping(tripsRole, m) &&
	          tripsRolePath === m.tripsRolePath &&
		  yourRole === m.yourRole &&
		  yourRoleFiller === m.yourRoleFiller);
	});
      if (this.checked) {
	roleMapping.optional = true;
	line.addClass('optional');
      } else {
	delete roleMapping.optional;
	line.removeClass('optional');
      }
    }
  });

  $(window).resize(function(evt) {
    // update all the things
    updateMap('trips', 'concept', { scroll: true, openClose: true });
    updateMap('trips', 'role',    { scroll: true, openClose: true });
    updateMap('your',  'concept', { scroll: true, openClose: true });
    updateMap('your',  'role',    { scroll: true, openClose: true });
  });

  /*
   * concept search
   */

  // see "load trees" section for trips concept search autocomplete call

  function tripsConceptSearch(search) {
    console.log('searching trips ontology for concept named ' + search);
    if (Object.prototype.hasOwnProperty.call(tripsOnt, search)) {
      tripsJsTree.deselect_all();
      tripsJsTree.select_node('ont__' + search);
      $('#ont__' + search)[0].scrollIntoView(true);
    } else {
      alert(search + ' not found');
    }
  }

  $('#trips-concept-search').on('submit', function(evt) {
    evt.preventDefault();
    tripsConceptSearch($(this['search']).val());
  });

  $('#your-concept-search input').autocomplete({
    minLength: 3,
    // can't use Object.keys(yourOntByName) directly here, because it might
    // change
    source: function(request, response) {
      var allNames = Object.keys(yourOntByName);
      var matchingNames =
        allNames.filter(function(name) {
	  return (name.indexOf(request.term) >= 0);
	});
      response(matchingNames);
    },
    select: function(evt, ui) { yourConceptSearch(evt.target.value); }
  });

  function yourConceptSearch(search) {
    console.log('searching your ontology for concept named ' + search);
    if (Object.prototype.hasOwnProperty.call(yourOntByName, search)) {
      var id = yourOntByName[search].id;
      yourJsTree.deselect_all();
      yourJsTree.select_node(id);
      $('#' + id)[0].scrollIntoView(true);
    } else {
      alert(search + ' not found');
    }
  }

  $('#your-concept-search').on('submit', function(evt) {
    evt.preventDefault();
    yourConceptSearch($(this['search']).val());
  });

  /*
   * detect unsaved changes and prompt before unloading the page
   */

  var haveUnsavedChanges = false;
  var unsavedChangesPrompt = 'There are unsaved changes. Are you sure you want to leave this page?'; // will be ignored by modern browsers, but might as well have it anyway
  window.onbeforeunload = function(evt) {
    if (haveUnsavedChanges) {
      evt.returnValue = unsavedChangesPrompt;
      return unsavedChangesPrompt;
    } else {
      return null; // don't prompt
    }
  };

  /*
   * add/remove your concept
   */

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
    haveUnsavedChanges = true;
  });

  $('#add-concept').on('click', function() {
    var concept = {
      name: '',
      comment: '',
      isSymbol: false,
      roles: [],
      words: [],
      examples: [],
      conceptMappings: []
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
    haveUnsavedChanges = true;
  });

  /*
   * select/add/remove concept mapping
   */

  function raiseRoleMappingLines() {
    var conceptMappingIndex = $('#select-concept-mapping')[0].selectedIndex;
    $('.from-concept-mapping-' + conceptMappingIndex).
    each(function(i, l) {
      var line = $(l);
      var className = line.attr('class');
      line.attr('class',
        className.replace(/\bfrom-concept-mapping-(\d+)\b/g, function(c, i) {
	  if (parseInt(i, 10) != conceptMappingIndex) {
	    return '';
	  } else {
	    return c;
	  }
	})
      );
    });
  }

  function updateRoleMapHeading() {
    var roleMapHeading = $('#details-heading td.map');
    roleMapHeading.removeAttr('class');
    roleMapHeading.addClass('map');
    var i = $('#select-concept-mapping')[0].selectedIndex;
    if (i >= 0) {
      roleMapHeading.addClass('from-concept-mapping-' + i);
    }
  }

  function updateSelectConceptMapping() {
    var scm = $('#select-concept-mapping');
    scm.empty();
    // if there are exactly one each of trips and your concepts selected
    var tripsIDs = tripsJsTree.get_selected();
    var yourIDs = yourJsTree.get_selected();
    if (tripsIDs.length == 1 && yourIDs.length == 1) {
      var tripsConcept = tripsOnt[tripsIDs[0].replace(/^ont__/, '')];
      var yourConcept = yourOntById[yourIDs[0]];
      // fill scm with as many options as there are applicable concept mappings
      var i = 0;
      yourConcept.conceptMappings.forEach(function(cm) {
	if (cm.tripsConcepts.includes(tripsConcept)) {
	  scm.append('<option>' + (++i) + '</option>');
	}
      });
    }
    scm.selectmenu('refresh');
    updateRoleMapHeading();
  }

  $('#select-concept-mapping').selectmenu();

  $('#select-concept-mapping').on('selectmenuselect', function(evt, ui) {
    updateRoleMapHeading();
    // update trips extra roles/paths
    var tripsIDs = tripsJsTree.get_selected();
    if (tripsIDs.length !== 1) { throw new Error('WTF'); }
    var tripsConcept = tripsOnt[tripsIDs[0].replace(/^ont__/, '')];
    showTripsRoles(tripsConcept);
    // update role map once that renders
    setTimeout(function() {
      updateMap('trips', 'role', { openClose: true });
    }, 0);
  });

  /* Given the selected pair of concepts on each side, return the selected
   * concept mapping object based on the selection box.
   * If it can't be found and onMissing is...
   * - undefined: return undefined
   * - 'error': throw an error
   * - 'add': add a new concept mapping
   */
  function selectedConceptMapping(tripsConcept, yourConcept, onMissing) {
    var conceptMappingIndex = $('#select-concept-mapping')[0].selectedIndex;
    var conceptMapping;
    for (var i = 0, j = 0; i < yourConcept.conceptMappings.length; i++) {
      var m = yourConcept.conceptMappings[i];
      if (m.tripsConcepts.includes(tripsConcept)) {
	if (j === conceptMappingIndex) {
	  conceptMapping = m;
	  break;
	}
	j++;
      }
    }
    if (conceptMapping === undefined) {
      if (onMissing === 'error') {
	throw new Error('Expected a concept mapping to be selected, but none is');
      } else if (onMissing === 'add') {
	conceptMapping = addConceptMapping(tripsConcept, yourConcept);
	selectLi($('#ont__' + tripsConcept.name + '__to__' + yourConcept.id));
      }
    }
    return conceptMapping;
  }

  function addConceptMapping(tripsConcept, yourConcept) {
    // get the line from an existing mapping if possible
    var line;
    for (var i = 0; i < yourConcept.conceptMappings.length; i++) {
      var m = yourConcept.conceptMappings[i];
      var j = m.tripsConcepts.indexOf(tripsConcept);
      if (j > -1) {
	line = m.lines[j];
	break;
      }
    }
    // otherwise make one
    if (line === undefined) {
      line = addLine($('#concept-lines'), 'ont__' + tripsConcept.name, yourConcept.id);
    }
    // also add option
    var select = $('#select-concept-mapping');
    var newVal = '' + (select[0].options.length + 1);
    select.append('<option>' + newVal + '</option>');
    select.val(newVal);
    select.selectmenu('refresh');
    updateRoleMapHeading();
    // construct and add the mapping itself
    var mapping = {
      tripsConcepts: [tripsConcept], // TODO take the full list from previously selected conceptMapping if any? (but copy the list, don't reference it)
      yourConcept: yourConcept,
      roleMappings: [],
      lines: [line] // TODO if doing the above TODO, also make a line for each
    };
    yourConcept.conceptMappings.push(mapping);
    haveUnsavedChanges = true;
    return mapping;
  }

  function remConceptMapping(tripsConcept, yourConcept) {
    var conceptMapping = selectedConceptMapping(tripsConcept, yourConcept, 'error');
    var i =
      yourConcept.conceptMappings.findIndex(function(m) {
	return m === conceptMapping;
      });
    if (i < 0) { throw new Error('WTF'); }
    var mapping = yourConcept.conceptMappings.splice(i, 1)[0];
    // remove each line if we're not still using it
    mapping.lines.forEach(function(line) {
      if (!yourConcept.conceptMappings.some(function(m) {
	     return m.lines.includes(line);
	   })) {
	line.remove();
      }
    });
    // remove option
    $('#select-concept-mapping option').last().remove();
    $('#select-concept-mapping').selectmenu('refresh');
    updateRoleMapHeading();
    showTripsRoles(tripsConcept);
    // update role map once that renders
    setTimeout(function() {
      updateMap('trips', 'role', { openClose: true });
    }, 0);
    haveUnsavedChanges = true;
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
      selectLi(mapping.lines[0]);
    } else {
      remConceptMapping(tripsConcept, yourConcept);
    }
  });

  function updateMappedTripsConcepts() {
    var tripsIDs = tripsJsTree.get_selected();
    var yourIDs = yourJsTree.get_selected();
    if (tripsIDs.length == 1 && yourIDs.length == 1) {
      var tripsConcept = tripsOnt[tripsIDs[0].replace(/^ont__/,'')];
      var yourConcept = yourOntById[yourIDs[0]];
      var conceptMapping = selectedConceptMapping(tripsConcept, yourConcept);
      if (conceptMapping !== undefined) {
	var input = $('#other-mapped-trips-concepts');
	var names =
	  input.val().toLowerCase().replace(/^[,\s]+/,'').split(/[,\s]+/);
	var newNames = [];
	var warnings = [];
	conceptMapping.tripsConcepts = [tripsConcept];
	if (names.length == 1 && names[0] === '') { names.pop(); }
	names.forEach(function(name) {
	  if (Object.prototype.hasOwnProperty.call(tripsOnt, name)) {
	    if (name === tripsConcept.name) {
	      warnings.push(
	        name + ' is the name of the TRIPS concept you have selected;' +
		' no need to put it in "other mapped TRIPS concepts".');
	    } else {
	      newNames.push(name);
	      conceptMapping.tripsConcepts.push(tripsOnt[name]);
	    }
	  } else {
	    warnings.push(
	      'There is no TRIPS concept named ' + name + '; removed.');
	  }
	});
	if (warnings.length > 0) {
	  alert(warnings.join("\n"));
	  input.val(newNames.join(' '));
	}
	updateMap('trips', 'concept', { openClose: true });
	haveUnsavedChanges = true;
      }
    }
  }

  $('#other-mapped-trips-concepts').on('change', updateMappedTripsConcepts);

  $('#other-mapped-trips-concepts').autocomplete({
    select: updateMappedTripsConcepts,
    source: function(request, response) {
      var fields =
	request.term.toLowerCase().replace(/^[,\s]+/,'').split(/[,\s]+/);
      var butLast = fields.slice(0,fields.length-1).join(' ');
      if (butLast !== '') {
	butLast += ' ';
      }
      var lastPrefix = fields[fields.length-1];
      var data = [];
      if (lastPrefix.length >= 3) {
	for (var name in tripsOnt) {
	  if ((!tripsJsTree.is_selected('ont__' + name)) &&
	      name.length >= lastPrefix.length &&
	      name.substr(0, lastPrefix.length) === lastPrefix) {
	    data.push({
	      label: name,
	      value: butLast + name
	    });
	  }
	}
      }
      response(data);
    }
  });

  /*
   * add/remove role mapping
   */

  /* Insert roleMapping into conceptMapping.roleMappings such that the order of
   * the added TRIPS roles and paths in tripsConcept is preserved.
   */
  function insertRoleMapping(tripsConcept, conceptMapping, roleMapping) {
    // iterate over dynamic_sem_frame and roleMappings simultaneously, keeping
    // them aligned, until we reach roleMapping.tripsRole, or the end
    var i = 0;
    var j = 0;
    var tripsRole;
    for (; i < tripsConcept.dynamic_sem_frame.length; i++) {
//      console.log({ dsf_i: i });
      var tripsRole = tripsConcept.dynamic_sem_frame[i];
      // attempt to advance to the beginning of the segment of roleMappings for
      // this tripsRole; failing that, stay where we are
      for (var k = j; k < conceptMapping.roleMappings.length; k++) {
//	console.log({ k: k });
	if (isTripsRoleFromMapping(tripsRole, conceptMapping.roleMappings[j])) {
	  j = k;
//	  console.log({ j: j });
	  break;
	}
      }
      if (isTripsRoleFromMapping(tripsRole, roleMapping)) { // found it!
	break;
      }
    }
//    console.log({ final_dsf_i: i, j: j });
    if (i < tripsConcept.dynamic_sem_frame.length) { // found the role
      if ('tripsRolePath' in roleMapping) {
	// try to find the path
	for (i = 0; i < tripsRole.paths.length; i++) {
//	  console.log({ p_i: i });
	  var path = tripsRole.paths[i];
	  for (var k = j; k < conceptMapping.roleMappings.length; k++) {
//	    console.log({ k: k });
	    if (path === conceptMapping.roleMappings[j].tripsRolePath) {
	      j = k;
//	      console.log({ j: j });
	      break;
	    }
	  }
	  if (path === roleMapping.tripsRolePath) { // found it!
	    break;
	  }
	}
//	console.log({ final_p_i: i, j: j });
	if (i < tripsRole.paths.length) { // found the path
	  // find the end of the mappings for this path
	  for (; j < conceptMapping.roleMappings.length; j++) {
//	    console.log({ j: j });
	    if (roleMapping.tripsRolePath !==
	        conceptMapping.roleMappings[j].tripsRolePath) {
	      break;
	    }
	  }
	}
      } else { // no path
        // find the end of the no-path mappings for this role
	for (; j < conceptMapping.roleMappings.length; j++) {
//	  console.log({ j: j });
	  var rm = conceptMapping.roleMappings[j]
	  if ((!isTripsRoleFromMapping(tripsRole, rm)) ||
	      'tripsRolePath' in rm) {
	    break;
	  }
	}
      }
    }
//    console.log({ final_j: j });
    conceptMapping.roleMappings.splice(j, 0, roleMapping);
  }

  function addRemRoleMapping(addOrRem, tripsLIs, yourLIs) {
    var tripsConceptID = tripsJsTree.get_selected()[0];
    var tripsConcept = tripsOnt[tripsConceptID.replace(/^ont__/,'')];
    var tripsRole;
    var tripsRolePath;
    var up = tripsLIs.parent().parent();
    if (up[0].tagName === 'LI') {
      tripsRole = tripsConcept.dynamic_sem_frame[up.index()];
      tripsRolePath = tripsRole.paths[tripsLIs.index()];
      if (addOrRem === 'add' &&
	  tripsRolePath.length > 0 &&
	  'fillerType' in tripsRolePath[tripsRolePath.length-1] &&
	  tripsRolePath[tripsRolePath.length-1].fillerType === 'nil'
	 ) {
	// TODO make this more user-visible and/or disallow it entirely by
	// throwing here and catching in the caller
	console.warn('adding a role mapping to a path ending with nil');
      }
    } else {
      tripsRole = tripsConcept.dynamic_sem_frame[tripsLIs.index()];
    }
    var yourConceptID = yourJsTree.get_selected()[0];
    var yourConcept = yourOntById[yourConceptID];
    var yourRole;
    var yourRoleFiller;
    var up = yourLIs.parent().parent();
    if (up[0].tagName === 'LI') {
      yourRole = yourConcept.roles[up.index()];
      yourRoleFiller = yourRole.fillers[yourLIs.index()];
    } else {
      yourRole = yourConcept.roles[yourLIs.index()];
    }
    var conceptMapping = selectedConceptMapping(tripsConcept, yourConcept, 'add');
    switch (addOrRem) {
      case 'add':
	var line = addLine($('#role-lines'), tripsLIs[0].id, yourLIs[0].id);
	var conceptMappingIndex = $('#select-concept-mapping')[0].selectedIndex;
	line.addClass('from-concept-mapping-' + conceptMappingIndex);
	var mapping = {
	  tripsConcepts: conceptMapping.tripsConcepts,
	  tripsRole: tripsRole,
	  yourConcept: yourConcept,
	  yourRole: yourRole,
	  line: line
	};
	if ($('#role-mapping-optional').prop('checked')) {
	  mapping.optional = true;
	  line.addClass('optional');
	}
	if (tripsRolePath !== undefined) {
	  mapping.tripsRolePath = tripsRolePath;
	}
	if (yourRoleFiller !== undefined) {
	  mapping.yourRoleFiller = yourRoleFiller;
	}
	insertRoleMapping(tripsConcept, conceptMapping, mapping);
	return mapping;
      case 'rem':
	var i =
	  conceptMapping.roleMappings.findIndex(function(m) {
	    return (isTripsRoleFromMapping(tripsRole, m) &&
		    tripsRolePath === m.tripsRolePath &&
		    yourRole === m.yourRole &&
		    yourRoleFiller === m.yourRoleFiller);
	  });
	// FIXME? this WTF can happen if the user tries to remove a role
	// mapping from a non-selected concept mapping
	if (i < 0) { throw new Error('WTF'); }
	var mapping = conceptMapping.roleMappings.splice(i, 1)[0];
	mapping.line.remove();
	return mapping;
      default:
        throw new Error('WTF');
    }
    haveUnsavedChanges = true;
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

  /*
   * add/remove everything else
   */

  $('#add-trips-role, #add-your-role, #add-example, #rem-trips-role, #rem-your-role, #rem-example').on('click', function(evt) {
    var ul = evt.target.parentNode.parentNode;
    if (/^add-/.test(this.id)) {
      var newLi =
        addLiBeforeTemplate(ul,
	    (this.id === 'add-trips-role' ? '.added' : undefined));
      if ('add-trips-role' == this.id) {
	// add an empty role
	var id = tripsJsTree.get_selected()[0];
	var concept = tripsOnt[id.replace(/^ont__/,'')];
	var i = newLi.index();
	concept.dynamic_sem_frame[i] = {
	  roles: [],
	  optional: true,
	  added: true,
	  paths: []
	};
        newLi.on('rem', remTripsRole);
      } else if ('add-your-role' == this.id) {
	// add an empty role
	var id = yourJsTree.get_selected()[0];
	var concept = yourOntById[id];
	var i = newLi.index();
	concept.roles[i] = {
	  name: '',
	  fillers: []
	};
	newLi.on('rem', remYourRole);
      } else if ('add-example' == this.id) {
	newLi.on('rem', remExample);
      }
      selectLi(newLi[0]);
      newLi.children().first().focus();
    } else {
      if (this.id === 'rem-trips-role') {
	remSelectedLi(ul, function(li) { return li.hasClass('added'); });
      } else if (this.id === 'rem-your-role') {
	remSelectedLi(ul, function(li) { return li.hasClass('own'); });
      } else { // rem-example
	remSelectedLi(ul);
      }
    }
    if (/-roles$/.test(ul.id)) {
      var side = (/^your-/.test(ul.id) ? 'your' : 'trips');
      setTimeout(function() {
	updateMap(side, 'role', { openClose: true });
      }, 0);
    }
    haveUnsavedChanges = true;
  });

  /*
   * trips role path handlers/autocomplete
   */

  function autocompleteTripsRolePath(request, response) {
    var fields =
      request.term.toLowerCase().replace(/^[,\s]+/,'').split(/[,\s]+/);
    var butLast = fields.slice(0,fields.length-1).join(' ');
    if (butLast !== '') {
      butLast += ' ';
    }
    var lastPrefix = fields[fields.length-1];
    var data = [];
    // decide what to include in the response, roles and/or concepts
    var includeRoles = false;
    var includeConcepts = false;
    if (lastPrefix === '') {
      includeRoles = true;
      /* actually, this is a bad idea, since it would include the whole ont
      var secondToLast = fields[fields.length-2];
      if (/^:/.test(secondToLast)) {
	includeConcepts = true;
      }*/
    } else if (/^:/.test(lastPrefix)) {
      includeRoles = true;
    } else if (lastPrefix.length >= 3) { // see also minLength
      includeConcepts = true;
    }
    // include roles first, since it's a shorter list
    if (includeRoles) {
      $('#trips-role-template option').each(function(i, o) {
	if ((!o.disabled) &&
	    o.text.length >= lastPrefix.length &&
	    o.text.substr(0, lastPrefix.length) === lastPrefix) {
	  data.push({
	    label: o.text,
	    value: butLast + o.text
	  });
	}
      });
    }
    if (includeConcepts) {
      for (var name in tripsOnt) {
	if (name.length >= lastPrefix.length &&
	    name.substr(0, lastPrefix.length) === lastPrefix) {
	  data.push({
	    label: name,
	    value: butLast + name
	  });
	}
      }
      // NOTE: 'nil' is also a valid choice for a final "concept".
      // We can use a simplified check here because we only autocomplete
      // concepts if lastPrefix is at least 3 chars, and 'nil' is exactly 3
      // chars
      if (lastPrefix === 'nil') {
	data.push({
	  label: 'nil',
	  value: butLast + 'nil'
	});
      }
    }
    response(data);
  }

  window.addTripsRolePath = function(evt) {
    var ul = evt.currentTarget.parentNode.parentNode;
    var newLi = addLiBeforeTemplate(ul, '.own');
    var roleIndex = $(ul.parentNode).index();
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var role = concept.dynamic_sem_frame[roleIndex];
    role.paths.push([]);
    // add role index to ID (path index already taken care of above)
    newLi.attr('id', newLi.attr('id').replace(/template/, '' + roleIndex));
    evt.stopPropagation(); // don't select the whole role
    selectLi(newLi[0]);
    var input = newLi.children('input');
    input.autocomplete({
      source: autocompleteTripsRolePath,
      change: changeTripsRolePath
    });
    input.first().focus();
    updateMap('trips', 'role', { openClose: true });
    haveUnsavedChanges = true;
  }

  function isTripsRoleName(name) {
    return $('#trips-role-template option').toArray().
	     some(function(o) { return name === o.text.replace(/^:/,''); });
  }

  function changeTripsRolePath(evt) {
    var input = evt.currentTarget;
    var roleIndex = $(input.parentNode.parentNode.parentNode).index();
    var pathIndex = $(input.parentNode).index();
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var role = concept.dynamic_sem_frame[roleIndex];
    try {
      var values = input.value.toLowerCase().trim().split(/[,\s]+/);
      var newPath = [];
      var lastStep = {};
      newPath.push(lastStep);
      values.forEach(function(v, i) {
	if ('' === v) {
	  throw 'Please enter a TRIPS concept name, a TRIPS role name, or a path of role names with optional concepts/final nil, or click the [-] button to remove this field.';
	} else if (/^:/.test(v)) { // role
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
	  if (!((i === values.length - 1 && fillerType === 'nil') ||
	        Object.prototype.hasOwnProperty.call(tripsOnt, fillerType))) {
	    throw 'Not a trips concept name or final nil: ' + fillerType;
	  }
	  lastStep.fillerType = fillerType;
	}
      });
      var yourIDs = yourJsTree.get_selected();
      if (yourIDs.length != 1) {
	throw 'No your concept selected, cannot save role path';
      }
      var yourConcept = yourOntById[yourIDs[0]];
      var conceptMapping = selectedConceptMapping(concept, yourConcept, 'add');
      var path = role.paths[pathIndex]; // old path
      var lastStepIsNil = (lastStep.fillerType === 'nil');
      var lastStepWasNil =
        (path.length > 0 && path[path.length-1].fillerType === 'nil');
      var roleMappingsToRemove = []
      // if final step just became nil, remove any real role mappings using
      // this path, and add fake one without yourRole so we can save this path
      if (lastStepIsNil && !lastStepWasNil) {
	conceptMapping.roleMappings =
	  conceptMapping.roleMappings.filter(function(rm) {
	    if (rm.tripsRolePath === path && 'yourRole' in rm) {
	      if (rm.line !== undefined) { rm.line.remove(); }
	      return false;
	    } else {
	      return true;
	    }
	  });
	insertRoleMapping(concept, conceptMapping, {
	  tripsConcepts: conceptMapping.tripsConcepts,
	  yourConcept: yourConcept,
	  tripsRole: role,
	  tripsRolePath: path
	  // no yourRole
	});
	// make sure handle is colored properly
	var conceptMappingIndex = 0;
	for (var i = 0; i < yourConcept.conceptMappings.length; i++) {
	  var cm = yourConcept.conceptMappings[i];
	  if (cm.tripsConcepts.includes(concept)) {
	    if (cm === conceptMapping) {
	      break;
	    }
	    conceptMappingIndex++;
	  }
	}
	var pathID = '#path-' + pathIndex + '-of-trips-role-' + roleIndex;
	if ($(pathID).attr('from-concept-mappings') === undefined) {
	  $(pathID).attr('from-concept-mappings', conceptMappingIndex);
	}
	$(pathID + '__handle').
	  removeAttr('class').
	  addClass('handle').
	  addClass('from-concept-mapping-' + conceptMappingIndex);
      }
      // if final step just became not nil, remove any such fake mappings
      if (lastStepWasNil && !lastStepIsNil) {
	conceptMapping.roleMappings =
	  conceptMapping.roleMappings.filter(function(rm) {
	    return (!(rm.tripsRolePath === path && !('yourRole' in rm)));
	  });
	// make sure handle isn't colored
	var pathID = '#path-' + pathIndex + '-of-trips-role-' + roleIndex;
	$(pathID + '__handle').
	  removeAttr('class').
	  addClass('handle');
      }
      input.value = values.join(' '); // normalize value
      // replace old path with newPath, but keep same Array object, in order to
      // preserve references
      path.splice.bind(path, 0, path.length).apply(path, newPath);
    } catch (e) {
      console.log(e);
      alert(e);
      setTimeout(function() { input.focus(); }, 0);
    }
    haveUnsavedChanges = true;
  }

  window.remTripsRolePath = function(evt) {
    var oldLi =
      remSelectedLi(evt.currentTarget.parentNode.parentNode,
		    function(li) { return li.hasClass('own'); });
    if (oldLi === null) { return; }
    var idFields = oldLi.attr('id').split(/-/); // path-#-of-trips-role-#
    var roleIndex = parseInt(idFields[5]);
    var pathIndex = parseInt(idFields[1]);
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var role = concept.dynamic_sem_frame[roleIndex];
    if (role.paths[pathIndex] !== undefined) {
      var rolePath;
      if (pathIndex == role.paths.length - 1) {
	// can just pop off the path
	rolePath = role.paths.pop();
      } else {
	// adjust IDs of all following lis
	for (var i = pathIndex + 1; i < role.paths.length; i++) {
	  $('#path-' +  i    + '-of-trips-role-' + roleIndex).attr('id',
	     'path-' + (i-1) + '-of-trips-role-' + roleIndex);
	}
	// splice out the path
	rolePath = role.paths.splice(pathIndex, 1)[0];
      }
      var yourIDs = yourJsTree.get_selected();
      if (yourIDs.length != 1) { throw new Error('WTF'); }
      var yourConcept = yourOntById[yourIDs[0]];
      yourConcept.conceptMappings.forEach(function(conceptMapping) {
	conceptMapping.roleMappings =
	  conceptMapping.roleMappings.filter(function(m) {
	    if (m.tripsRolePath === rolePath) {
	      if (m.line !== undefined) { m.line.remove(); }
	      return false;
	    } else {
	      return true;
	    }
	  });
      });
    }
    updateMap('trips', 'role', { openClose: true });
    haveUnsavedChanges = true;
  }

  /*
   * trips roles onchange/rem handlers
   */

  window.inputTripsRoleName = function(evt) {
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var newName = $(evt.currentTarget).val().replace(/^:/, '');
    if (concept.dynamic_sem_frame.some(function(roleRestrMap) {
	  return roleRestrMap.roles.includes(newName);
       })) {
      alert('Warning: there is already a :' + newName + ' role');
    }
    var i = $(evt.currentTarget).parent().index();
    concept.dynamic_sem_frame[i].roles = [newName];
    haveUnsavedChanges = true;
  };

  function remTripsRole(evt) {
    // 'rem' event from remTripsRolePath can bubble up here, so check that
    // evt.target is really a trips role li before proceeding
    if (!/^trips-role-/.test(evt.target.id)) { return; }
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var i = $(this).index();
    if (concept.dynamic_sem_frame[i] !== undefined) { // FIXME this check is obsolete?
      var role;
      if (concept.dynamic_sem_frame.length == i+1) {
	// can just pop off the role
	role = concept.dynamic_sem_frame.pop();
      } else {
	// adjust IDs of all following lis
	for (var j = i + 1; j < concept.dynamic_sem_frame.length; j++) {
	  $('#trips-role-' +  j   ).attr('id',
	     'trips-role-' + (j-1));
	  concept.dynamic_sem_frame[j].paths.forEach(function(path, k) {
	    $('#path-' + k + '-of-trips-role-' +  j   ).attr('id',
	       'path-' + k + '-of-trips-role-' + (j-1));
	  });
	}
	// splice out the role
	role = concept.dynamic_sem_frame.splice(i, 1)[0];
      }
      var yourIDs = yourJsTree.get_selected();
      if (yourIDs.length != 1) { throw new Error('WTF'); }
      var yourConcept = yourOntById[yourIDs[0]];
      yourConcept.conceptMappings.forEach(function(conceptMapping) {
	if (conceptMapping.tripsConcepts.includes(concept)) {
	  conceptMapping.roleMappings =
	    conceptMapping.roleMappings.filter(function(m) {
	      if (isTripsRoleFromMapping(role, m)) {
		if (m.line !== undefined) { m.line.remove(); }
		return false;
	      } else {
		return true;
	      }
	    });
	}
      });
      haveUnsavedChanges = true;
    }
  }

  /*
   * your details oninput/onchange/rem handlers
   */

  $('#your-concept-name').on('change', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var newName = $(this).val();
    if (Object.prototype.hasOwnProperty.call(yourOntByName, newName)) {
      alert('There is already a concept in your ontology named ' + JSON.stringify(newName) + ".\nYou must rename that concept first if you want to change the name of this concept from " + JSON.stringify(concept.name) + ' to ' + JSON.stringify(newName) + '.');
      $(this).val(concept.name);
      yourJsTree.set_text(id, ('' == concept.name ? '(new concept)' : concept.name));
      return;
    }
    delete yourOntByName[concept.name];
    concept.name = newName;
    yourJsTree.set_text(id, concept.name);
    yourOntByName[concept.name] = concept;
    haveUnsavedChanges = true;
  });

  $('#your-concept-name').on('input', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var newName = $(this).val();
    yourJsTree.set_text(id, newName);
    haveUnsavedChanges = true;
  });

  $('#your-concept-comment').on('input', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    concept.comment = $(this).val();
    haveUnsavedChanges = true;
  });

  $('#is-symbol').on('change', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    concept.isSymbol = evt.currentTarget.checked;
    if (concept.isSymbol) {
      // clear roles and role mappings
      concept.roles = [];
      concept.conceptMappings.forEach(function(cm) {
	cm.roleMappings = [];
      });
      clearUlUpToTemplate($('#your-roles'));
    }
    showYourRoles(concept);
    haveUnsavedChanges = true;
  });

  window.inputYourRole = function(evt, key) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var i = $(evt.currentTarget).closest('li').index();
    if (concept.roles.length <= i) {
      throw new Error('WTF');
    }
    var role = concept.roles[i];
    if ($(evt.currentTarget).attr('type') == 'checkbox') {
      role[key] = evt.currentTarget.checked;
    } else {
      role[key] = $(evt.currentTarget).val();
    }
    haveUnsavedChanges = true;
  };

  window.inputYourRoleFilledBySymbol = function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var roleLi = $(evt.currentTarget).closest('li');
    var i = roleLi.index();
    if (concept.roles.length <= i) {
      throw new Error('WTF');
    }
    var role = concept.roles[i];
    role.filledBySymbol = evt.currentTarget.checked;
    var fillerValuesUl = roleLi.children('ul');
    if (role.filledBySymbol) {
      // remove any role filler values and their mappings
      clearUlUpToTemplate(fillerValuesUl);
      role.fillers.splice(0); // empty the array
      concept.conceptMappings.forEach(function(conceptMapping) {
	conceptMapping.roleMappings =
	  conceptMapping.roleMappings.filter(function(m) {
	    if (m.yourRole === role) {
	      if (m.line !== undefined) { m.line.remove(); }
	      return false;
	    } else {
	      return true;
	    }
	  });
      });
      fillerValuesUl.hide();
    } else {
      fillerValuesUl.show();
    }
    updateMap('your', 'role', { openClose: true });
    haveUnsavedChanges = true;
  };

  function remYourRole(evt) {
    // 'rem' event from remYourRoleFiller can bubble up here, so check that
    // evt.target is really a your role li before proceeding
    if (!/^your-role-/.test(evt.target.id)) { return; }
    // NOTE: this isn't called for inherited roles
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var i = $(this).index();
    if (concept.roles[i] !== undefined) {
      var role;
      if (concept.roles.length == i+1) {
	// can just pop off the role
	role = concept.roles.pop();
      } else {
	// adjust IDs of all following lis
	for (var j = i + 1; j < concept.roles.length; j++) {
	  $('#your-role-' +  j   ).attr('id',
	     'your-role-' + (j-1));
	}
	// splice out the role
	role = concept.roles.splice(i, 1)[0];
      }
      concept.conceptMappings.forEach(function(cm) {
	cm.roleMappings =
	  cm.roleMappings.filter(function(rm) {
	    if (rm.yourRole === role) {
	      if (rm.line !== undefined) { rm.line.remove(); }
	      return false;
	    } else {
	      return true;
	    }
	  });
      });
      haveUnsavedChanges = true;
    }
  }

  // TODO factor out stuff this has in common with add/remTripsRolePath
  window.addYourRoleFiller = function(evt) {
    var ul = evt.currentTarget.parentNode.parentNode;
    var newLi = addLiBeforeTemplate(ul, '.own');
    var roleIndex = $(ul.parentNode).index();
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var role = concept.roles[roleIndex];
    if (role.inherited) {
      delete role.inherited;
      // FIXME the fact that this changes to non-inherited doesn't show up in
      // the GUI immediately, but can't just call showYourRoles here because
      // we're in the middle of changing what it shows
    }
    role.fillers.push({ value: '' });
    // add role index to ID (path index already taken care of above)
    newLi.attr('id', newLi.attr('id').replace(/template/, '' + roleIndex));
    evt.stopPropagation(); // don't select the whole role
    selectLi(newLi[0]);
    var input = newLi.children('input');
    input.first().focus();
    updateMap('your', 'role', { openClose: true });
    haveUnsavedChanges = true;
  };

  window.remYourRoleFiller = function(evt) {
    var oldLi =
      remSelectedLi(evt.currentTarget.parentNode.parentNode,
		    function(li) { return li.hasClass('own'); });
    if (oldLi === null) { return; }
    var idFields = oldLi.attr('id').split(/-/); // filler-#-of-your-role-#
    var roleIndex = parseInt(idFields[5]);
    var fillerIndex = parseInt(idFields[1]);
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var role = concept.roles[roleIndex];
    if (role.fillers[fillerIndex] !== undefined) {
      var filler;
      if (fillerIndex == role.fillers.length - 1) {
	// can just pop off the path
	filler = role.fillers.pop();
      } else {
	// adjust IDs of all following lis
	for (var i = fillerIndex + 1; i < role.fillers.length; i++) {
	  $('#filler-' +  i    + '-of-your-role-' + roleIndex).attr('id',
	     'filler-' + (i-1) + '-of-your-role-' + roleIndex);
	}
	// splice out the path
	filler = role.fillers.splice(fillerIndex, 1)[0];
      }
      concept.conceptMappings.forEach(function(conceptMapping) {
	conceptMapping.roleMappings =
	  conceptMapping.roleMappings.filter(function(m) {
	    if (m.yourRoleFiller === filler) {
	      if (m.line !== undefined) { m.line.remove(); }
	      return false;
	    } else {
	      return true;
	    }
	  });
      });
    }
    updateMap('your', 'role', { openClose: true });
    haveUnsavedChanges = true;
  };

  window.changeYourRoleFiller = function(evt) {
    var input = evt.target;
    var roleIndex = $(input.parentNode.parentNode.parentNode).index();
    var fillerIndex = $(input.parentNode).index();
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var role = concept.roles[roleIndex];
    var filler = role.fillers[fillerIndex];
    filler.value = $(input).val();
    haveUnsavedChanges = true;
  };

  $('#your-words').on('input', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    concept.words = $(this).val().trim().replace(/\s+/, ' ').split(/\s*,\s*/);
    lookupAndUpdateWordCounts(concept);
    haveUnsavedChanges = true;
    return true;
  });

  window.inputYourExample = function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var i = $(evt.currentTarget).parent().index();
    concept.examples[i] = $(evt.currentTarget).val();
    haveUnsavedChanges = true;
  };

  function remExample(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    var i = $(this).index();
    if (concept.examples[i] !== undefined) {
      if (concept.examples.length == i+1) {
	concept.examples.pop();
      } else {
	// adjust IDs of all following lis
	for (var j = i + 1; j < concept.examples.length; j++) {
	  $('#your-example-' +  j   ).attr('id',
	     'your-example-' + (j-1));
	}
	// splice out the example
	concept.examples.splice(i, 1)[0];
      }
      haveUnsavedChanges = true;
    }
  }

  /*
   * loading and saving
   */

  /* Return a savable representation of your ontology and mappings */
  function savableRepresentation() {
    var ret = { // hope nobody makes a concept with these names
      ontologySaveDate: new Date(),
      ontologyPrefix: $('#your-ontology-prefix').val()
    };
    for (var id in yourOntById) {
      var concept = yourOntById[id];
      var mappings = concept.conceptMappings.map(function(m) {
	return {
	  concepts: m.tripsConcepts.map(function(tc) {
	    return 'ont::' + tc.name;
	  }),
	  rolePathMappings: m.roleMappings.map(function(rm) {
	    var tripsRolePath = (rm.tripsRolePath || [{}])
	    var repPath = tripsRolePath.map(function(step) {
	      var repStep = {
		role: 'ont::' + (('role' in step) ? step.role :
				  rm.tripsRole.roles[0])
	      };
	      if ('fillerType' in step) {
		if (step.fillerType === 'nil') {
		  repStep.fillerType = 'nil';
		} else {
		  repStep.fillerType = 'ont::' + step.fillerType;
		}
	      }
	      return repStep;
	    });
	    if (rm.optional) {
	      repPath.unshift('optional');
	    }
	    if ('yourRole' in rm) {
	      repPath.push(rm.yourRole.name);
	    }
	    if ('yourRoleFiller' in rm) {
	      repPath.push(rm.yourRoleFiller.value);
	    }
	    return repPath;
	  })
	};
      });
      var roles =
	concept.roles.
	filter(function(r) { return !r.inherited; }).
	map(function(r) {
	  return { name: r.name, filledBySymbol: r.filledBySymbol };
	});
      ret[concept.name] = {
	comment: concept.comment,
	isSymbol: concept.isSymbol,
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
    var newOntPrefix = '';
    var newOntByName = {};
    var newOntById = {};
    var treeNodesByName = {};
    var treeNodeIndex = 1;
    var allWords = [];
    // reset extra stuff in tripsOnt
    for (var name in tripsOnt) {
      delete tripsOnt[name].dynamic_sem_feats;
      delete tripsOnt[name].dynamic_sem_frame;
    }
    for (var name in rep) {
      if (name === 'ontologySaveDate') { continue; }
      if (name === 'ontologyPrefix') {
	newOntPrefix = rep[name];
	continue;
      }
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
	  isSymbol: !!repConcept.isSymbol, // convert to boolean
	  words: repConcept.words,
	  examples: repConcept.examples
	};
	allWords = allWords.concat(repConcept.words);
	var roles = [];
	var roleMappings = [];
	repConcept.roles.forEach(function(r) {
	  switch (typeof r) {
	    case 'object': // format 1 and 3
	      if (r === null) {
		fail('expected role to be non-null');
	      }
	      if ('string' !== typeof r.name) {
		fail('expected role name to be a string');
	      }
	      var yourRole = {
		name: r.name,
		filledBySymbol: !!r.filledBySymbol,
		fillers: []
	      };
	      roles.push(yourRole);
	      if ('mappings' in r) { // format 1
		if (!Array.isArray(r.mappings)) {
		  fail('expected role mappings to be an array');
		}
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
		  if (Object.prototype.hasOwnProperty.call(tripsOnt, tripsName)) {
		    var tripsConcept = tripsOnt[tripsName];
		    var tripsRoleName = m.rolePath[0].role;
		    if (('string' !== typeof tripsRoleName) || !/^ont::/.test(tripsRoleName)) {
		      fail('expected role mapping role to be a string starting with ont::');
		    }
		    tripsRoleName = tripsRoleName.replace(/^ont::/, '');
		    if (!isTripsRoleName(tripsRoleName)) {
		      warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a non-existent trips role ' + tripsRoleName + '; role mapping deleted');
		      continue; // prevents us from using forEach :(
		    }
		    var tripsRole = {
		       roles: [tripsRoleName],
		       paths: [],
		       optional: true,
		       added: true // may change to inherited later
		    };
		    var newMapping = {
		      tripsConcepts: [tripsConcept], // to be replaced later
		      tripsRole: tripsRole,
		      yourConcept: yourConcept,
		      yourRole: yourRole
		    };
		    if (m.rolePath.length > 1 || ('fillerType' in m.rolePath[0])) {
		      var newPath = [];
		      //m.rolePath.forEach(function(step, j) { // still need continue
		      for (var j = 0; j < m.rolePath.length; j++) {
			var step = m.rolePath[j];
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
			    if (!Object.prototype.hasOwnProperty.call(tripsOnt, newStep.fillerType)) {
			      warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a path using a non-existing trips concept ' + newStep.fillerType + '; role mapping deleted');
			      continue mapping;
			    }
			  }
			  newPath.push(newStep);
			}
		      }
		      //});
		      newMapping.tripsRolePath = newPath;
		      tripsRole.paths.push(newPath);
		    }
		    roleMappings.push(newMapping);
		  } else {
		    warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a non-existent trips concept ' + tripsName + '; role mapping deleted');
		  }
		}
		//});
		// end load old format role mappings
	      }
	      break;
	    case 'string': // format 2
	      roles.push({ name: r, filledBySymbol: false, fillers: [] });
	      break;
	    default:
	      fail('expected role to be either a string or an object');
	  }
	});
	var conceptMappings = [];
	//repConcept.mappings.forEach(function(m) { // need continue :(
	for (var cmi = 0; cmi < repConcept.mappings.length; cmi++) {
	  var cm = repConcept.mappings[cmi];
	  switch (typeof cm) {
	    case 'string': // old format
	      if (!/^ont::/.test(cm)) {
		fail('expected concept mapping string to start with ont::');
	      }
	      var tripsName = cm.replace(/^ont::/,'');
	      if (Object.prototype.hasOwnProperty.call(tripsOnt, tripsName)) {
		conceptMappings.push({
		  yourConcept: yourConcept,
		  tripsConcepts: [tripsOnt[tripsName]],
		  roleMappings: []
		});
	      } else {
		warn('your concept ' + name + ' has a mapping to a non-existent trips concept ' + tripsName + '; concept mapping deleted');
	      }
	      break;
	    case 'object': // new format
	      if (cm === null) {
		fail('expected concept mapping to be non-null');
	      }
	      if (!(Array.isArray(cm.concepts) && cm.concepts.length > 0)) {
		fail('expected concept mapping concepts to be an array with at least one element');
	      }
	      if (!Array.isArray(cm.rolePathMappings)) {
		fail('expected concept mapping rolePathMappings to be an array');
	      }
	      var conceptMapping = {
		yourConcept: yourConcept,
		tripsConcepts: [],
		roleMappings: []
	      };
	      cm.concepts.forEach(function(c) {
		if (('string' !== typeof c) || !/^ont::/.test(c)) {
		  fail('expected concept mapping concept to be a string starting with ont::');
		}
		c = c.replace(/^ont::/, '');
		if (Object.prototype.hasOwnProperty.call(tripsOnt, c)) {
		  conceptMapping.tripsConcepts.push(tripsOnt[c]);
		  // apply inheritance so we can replace .added=true with
		  // .inherited=true in tripsRoles in roleMappings when all
		  // conceptMapping.tripsConcepts have that tripsRole, whether
		  // inherited or not
		  applyTripsInheritance(tripsOnt[c]);
		} else {
		  warn('your concept ' + name + ' has a mapping to a non-existent trips concept ' + c);
		}
	      });
	      if (conceptMapping.tripsConcepts.length == 0) {
		warn('your concept ' + name + ' has a mapping to only non-existent trips concepts; mapping dropped');
		continue;
	      }
	      //cm.rolePathMappings.forEach(function(repPath) {
	      mapping: for (var rmi = 0; rmi < cm.rolePathMappings.length; rmi++) {
		var repPath = cm.rolePathMappings[rmi];
		if (!(Array.isArray(repPath) && repPath.length > 0)) {
		  fail('expected rolePathMapping to be an array with at least one element');
		}
		var yourRoleName = undefined;
		var yourRoleFillerValue = undefined;
		if (repPath.length > 1 &&
		    ('string' === typeof repPath[repPath.length-2])) {
		  if (!('string' === typeof repPath[repPath.length-1])) {
		    fail('expected last element of rolePathMapping to be a string given that the second to last element is a string');
		  }
		  yourRoleFillerValue = repPath.pop();
		  yourRoleName = repPath.pop();
		} else if ('string' === typeof repPath[repPath.length-1]) {
		  yourRoleName = repPath.pop();
		}
		if (repPath.length == 0) {
		  fail('expected rolePathMapping to have some step objects');
		}
		var optional = false;
		if (repPath[0] === 'optional') {
		  optional = true;
		  repPath.shift();
		}
		if (repPath.length == 0) {
		  fail('expected rolePathMapping to have some step objects');
		}
		if (yourRoleName === undefined &&
		    repPath[repPath.length-1].fillerType !== 'nil') {
		  fail('expected rolePathMapping with no your role name to end with a fillerType of nil');
		}
		if (!('role' in repPath[0])) {
		  fail('expected rolePathMapping to start with a trips role (possibly after "optional")');
		}
		var tripsRoleName = repPath[0].role;
		if (!(('string' === typeof tripsRoleName) &&
		      /^ont::/.test(tripsRoleName))) {
		  fail('expected trips role name to be a string starting with ont::');
		}
		tripsRoleName = tripsRoleName.replace(/^ont::/, '');
		if (!isTripsRoleName(tripsRoleName)) {
		  fail('not a valid trips role name: ' + tripsRoleName);
		}
		var tripsRole = {
		  roles: [tripsRoleName],
		  paths: [],
		  optional: true
		};
		// add .inherited=true or .added=true, depending on whether all
		// the tripsConcepts have a non-added role with this name
		if (conceptMapping.tripsConcepts.every(function(c) {
		      return c.dynamic_sem_frame.some(function(roleRestrMap) {
			return ((!roleRestrMap.added) &&
				roleRestrMap.roles.includes(tripsRoleName));
		      });
		    })) {
		  tripsRole.inherited = true;
		} else {
		  tripsRole.added = true;
		}
		var roleMapping = {
		  tripsConcepts: conceptMapping.tripsConcepts,
		  tripsRole: tripsRole,
		  yourConcept: yourConcept
		};
		if (optional) {
		  roleMapping.optional = true;
		}
		if (yourRoleName !== undefined) {
		  roleMapping.yourRole =
		    roles.find(function(r) { return r.name === yourRoleName });
		  if (roleMapping.yourRole === undefined) {
		    // assume it's inherited and fake it (to be fixed later)
		    roleMapping.yourRole =
		      { name: yourRoleName, inherited: true };
		  }
		}
		if (yourRoleFillerValue !== undefined) {
		  roleMapping.yourRoleFiller =
		    roleMapping.yourRole.fillers.find(function(f) {
		      return f.value === yourRoleFillerValue;
		    });
		  if (roleMapping.yourRoleFiller === undefined) {
		    roleMapping.yourRoleFiller =
		      { value: yourRoleFillerValue };
		    roleMapping.yourRole.fillers.push(
		        roleMapping.yourRoleFiller);
		  }
		}
		if (repPath.length > 1 || ('fillerType' in repPath[0])) {
		  var newPath = [];
		  //m.rolePath.forEach(function(step, j) { // still need continue
		  for (var j = 0; j < repPath.length; j++) {
		    var step = repPath[j];
		    if (j != 0 || ('fillerType' in step)) {
		      var newStep = {};
		      if (j != 0) {
			if (('string' !== typeof step.role) || !/^ont::/.test(step.role)) {
			  fail('expected role mapping role to be a string starting with ont::');
			}
			newStep.role = step.role.replace(/^ont::/,'');
			if (!isTripsRoleName(newStep.role)) {
			  warn('your concept ' + name + ' has a mapping to a non-existent trips role ' + newStep.role + '; role mapping deleted');
			  continue mapping;
			}
		      }
		      if ('fillerType' in step) {
			if (('string' !== typeof step.fillerType) ||
			    !/(^ont::|^nil$)/.test(step.fillerType)) {
			  fail('expected role mapping fillerType to be a string starting with ont:: or "nil"');
			}
			newStep.fillerType = step.fillerType.replace(/^ont::/,'');
			if (newStep.fillerType !== 'nil' &&
			    !Object.prototype.hasOwnProperty.call(tripsOnt, newStep.fillerType)) {
			  warn('your concept ' + name + ' has a mapping to a path using a non-existing trips concept ' + newStep.fillerType + '; role mapping deleted');
			  continue mapping;
			}
		      }
		      newPath.push(newStep);
		    }
		  }
		  //});
		  roleMapping.tripsRolePath = newPath;
		}
		conceptMapping.roleMappings.push(roleMapping);
	      }
	      // });
	      conceptMappings.push(conceptMapping);
	      break;
	    default:
	      fail('expected concept mapping to be either a string starting with ont:: or an object');
	  }
	}
	// });
	// insert old-style roleMappings into appropriate conceptMappings,
	// adding if necessary, and set roleMapping.tripsConcepts to that of
	// the conceptMapping
	roleMappings.forEach(function(rm) {
	  var cm =
	    conceptMappings.find(function(m) {
	      return m.tripsConcepts.includes(rm.tripsConcepts[0]);
	    });
	  if (cm === undefined) {
	    cm = {
	      yourConcept: yourConcept,
	      tripsConcepts: rm.tripsConcepts,
	      roleMappings: []
	    };
	  }
	  cm.roleMappings.push(rm);
	  rm.tripsConcepts = cm.tripsConcepts;
	  // replace rm.tripsRole.added with inherited depending on whether all
	  // of the cm.tripsConcepts have a non-added role of that name after
	  // inheritance
	  if (cm.tripsConcepts.every(function(c) {
	       applyTripsInheritance(c);
	       return c.dynamic_sem_frame.some(function(roleRestrMap) {
		 return ((!roleRestrMap.added) &&
			 roleRestrMap.roles.includes(rm.tripsRole.roles[0]));
	       });
	     })) {
	    delete rm.tripsRole.added;
	    rm.tripsRole.inherited = true;
	  }
	});
	yourConcept.conceptMappings = conceptMappings;
	yourConcept.roles = roles;
	newOntByName[name] = yourConcept;
	newOntById[yourConcept.id] = yourConcept;
      } catch (e) {
	throw new Error(e.message + ' in ' + name + ': ' + JSON.stringify(repConcept)/* + "\n" + e.stack*/);
      }
      if (warnings.length > 0) {
	alert("Warnings:\n" + warnings.join("\n"));
      }
    }
    // fix inherited your role references
    for (var descendantName in newOntByName) {
      var descendant = newOntByName[descendantName];
      descendant.conceptMappings.forEach(function(conceptMapping) {
	conceptMapping.roleMappings.forEach(function(roleMapping) {
	  if (('yourRole' in roleMapping) && roleMapping.yourRole.inherited) {
	    var ancestorName = rep[descendantName].parent;
	    var ancestorRole = undefined;
	    while (ancestorName !== undefined && ancestorRole === undefined) {
	      var ancestor = newOntByName[ancestorName];
	      var ancestorRole =
	        ancestor.roles.find(function(r) {
		  return r.name === roleMapping.yourRole.name;
		});
	      ancestorName = rep[ancestorName].parent;
	    }
	    if (ancestorRole === undefined) {
	      warn('your concept named ' + descendant.name + " has a role mapping from a trips role to a role it doesn't have, " + roleMapping.yourRole.name + '; adding the role');
	      delete roleMapping.yourRole.inherited;
	      descendant.roles.push(roleMapping.yourRole);
	    } else { // ancestorRole found
	      // inherit from it so we get name updates
	      roleMapping.yourRole = {
		__proto__: ancestorRole,
		inherited: true
	      };
	    }
	  }
	});
      });
    }
    // build the jsTree data
    var newJsTreeData = [];
    for (var name in rep) {
      if (name === 'ontologySaveDate' || name === 'ontologyPrefix') {
	continue;
      }
      var siblings =
        (('parent' in rep[name]) ?
	  treeNodesByName[rep[name].parent].children : newJsTreeData);
      siblings.push(treeNodesByName[name])
    }
    $('#your-tree').one('load_node.jstree', function() {
      // update the map UI
      updateMap('your', 'concept', { openClose: true });
      // in case a concept was selected already and we changed the paths in it
      updateMap('trips', 'role', { openClose: true });
      // look up all words used in your concepts
      allWords = sortUniq(allWords);
      lookUpWords(allWords, function() {});
    });
    yourJsTree.deselect_all();
    yourJsTree.settings.core.data = newJsTreeData;
    yourJsTree.refresh();
    yourOntByName = newOntByName;
    yourOntById = newOntById;
    // we deleted all dynamic_sem_frames, so remake the selected concept's if
    // there is one
    var selectedIDs = tripsJsTree.get_selected();
    if (selectedIDs.length == 1) {
      showTripsRoles(tripsOnt[selectedIDs[0].replace(/^ont__/, '')]);
    }
    $('#your-ontology-prefix').val(newOntPrefix);
  }

  $('#save').on('click', function(evt) {
    // set the href of the file-output link to a data URI of JSON, and click it
    $('#file-output').attr('href',
      'data:application/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(savableRepresentation(), null, "\t"))
    // not sure why [0] is necessary, but it doesn't work without it
    )[0].click();
    haveUnsavedChanges = false;
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
	haveUnsavedChanges = false;
      } catch (e) {
	alert('Error loading file ' + file.name + ': ' + e.message);
      } finally {
	// reset the file input so that we get a change event again even if
	// we're loading from the same filename
	// NOTE: $('#file-input').val('') doesn't work for security reasons
	$('#file-input-form')[0].reset();
      }
    };
    reader.readAsText(file);
  });

  $('#build').on('click', function(evt) {
    $('#build-input-data').val(
      JSON.stringify(savableRepresentation(), null, "\t")
    );
    return true; // keep submitting form
  });

  /*
   * hide unfilled details until something happens
   */

  $('#trips-details').hide();
  $('#your-details').hide();

  // prevent Safari from putting its own spellcheck popup on top of our
  // autocomplete popup
  $('input').not('.spellcheck').attr('spellcheck', 'false');

  /*
   * add color coding CSS rules
   */

  // Levels of RGB in colors that should be easy to distinguish from each other
  // (and from other colors used in the interface), especially the first few.
  // Deliberately omitted colors:
  // light cyan - for selections
  // black - for non-color-coded stuff
  // grey - for inherited stuff
  // white - for background
  // and a few others hard to distinguish from each other, or hard to see on a
  // white background
  var colorScheme = [
    [0, 0, 1], // single component dark
    [0, 1, 0],
    [1, 0, 0],
    [0, 1, 1], // two component dark
    [1, 0, 1],
    [1, 1, 0],
    [0, 0, 2], // single component bright
    [0, 2, 0],
    [2, 0, 0],
    [1, 0, 2], // two components, one bright
    [2, 1, 0],
    [2, 0, 2], // two components, both bright (magenta)
    [1, 2, 1], // all three components, one bright
    [2, 1, 1],
    [2, 1, 2]
  ];
  var colorLevels = [0, 159, 255]; // log-ish scale
  var colorStyle = $('<style type="text/css">');
  colorStyle.append(
    // foreground of selected menu item
    "#select-concept-mapping-menu li.ui-menu-item div.ui-state-active { color: white !important; }\n"
  );
  colorScheme.forEach(function(rgbProps, i) {
    var red   = colorLevels[rgbProps[0]];
    var green = colorLevels[rgbProps[1]];
    var blue  = colorLevels[rgbProps[2]];
    var color = 'rgb(' + [red,green,blue].join(',') + ')';
    colorStyle.append(
      // foreground of non-selected menu item
      '#select-concept-mapping-menu li.ui-menu-item:nth-child(' + (i+1) +
        ') div { color: ' + color + "; }\n" +
      // background of selected menu item
      '#select-concept-mapping-menu li.ui-menu-item:nth-child(' + (i+1) +
        ') div.ui-state-active { background-color: ' + color + "; }\n" +
      // role mapping line, etc.
      '.from-concept-mapping-' + i +
      ' { stroke: ' + color +
       '; fill: ' + color +
       '; background-color: ' + color +
       "; color: white; }\n"
    );
  });
  $(document.head).append(colorStyle);
});
