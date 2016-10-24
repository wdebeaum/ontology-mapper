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
    return true;
  };

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

  function updateMap(side, conceptOrRole, opts) {
    if (!opts) { opts = {}; }
    var mapWidth = $('.map')[0].offsetWidth - 4; // FIXME see CSS
    var handlesG = $('#' + side + '-' + conceptOrRole + '-handles');
    if (opts.scroll) {
      var scroll =
          $('#' + side + '-' +
		  (('concept' === conceptOrRole) ? 'tree-scroll' : 'details')
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
	var nodeHeight =
	  ((node.firstElementChild === null) ?
	    // no element children means it's just this row
	    node.offsetHeight :
	    // element children means it could have child nodes underneath, so
	    // only take the height of the first element child
	    node.firstElementChild.offsetHeight);
	handle.setAttribute('cy', node.offsetTop + nodeHeight/2);
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
	    var yourVisibleAncestorID = visibleAncestorID(yourJsTree, yourID);
	    var yourHandle = $('#' + yourVisibleAncestorID + '__handle');
	    yourConcept.conceptMappings.forEach(function(m) {
	      var tripsID = 'ont__' + m.tripsConcept.name;
	      var tripsVisibleAncestorID =
	        visibleAncestorID(tripsJsTree, tripsID);
	      var tripsHandle = $('#' + tripsVisibleAncestorID + '__handle');
	      var hidden =
	        (yourID !== yourVisibleAncestorID ||
		 tripsID !== tripsVisibleAncestorID);
	      m.line =
	        addLine(linesG, tripsVisibleAncestorID, yourVisibleAncestorID,
			hidden);
	      if (tripsJsTree.is_selected(tripsVisibleAncestorID) &&
		  yourJsTree.is_selected(yourVisibleAncestorID)) {
		m.line.addClass('selected');
	      }
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
	    // FIXME what about mappings inherited on the TRIPS side?
	    yourConcept.roleMappings.forEach(function(m) {
	      if (m.tripsConcept === tripsConcept) {
		var tripsRoleIndex = tripsConcept.dynamic_sem_frame.indexOf(m.tripsRole);
		var yourRoleIndex =
		  yourConcept.roles.findIndex(function(r) {
		    return r.name === m.yourRole.name;
		  });
		var tripsRoleID = 'trips-role-' + tripsRoleIndex;
		var yourRoleID = 'your-role-' + yourRoleIndex;
		if (m.tripsRolePath) {
		  var tripsRolePathIndex =
		    m.tripsRole.paths.findIndex(function(path) {
		      return path.every(function(rStep, i) {
			mStep = m.tripsRolePath[i];
			return (mStep.role === rStep.role &&
			        mStep.fillerType === rStep.fillerType);
		      });
		    });
		  tripsRoleID = 'path-' + tripsRolePathIndex + '-of-' + tripsRoleID;
		}
		m.line = addLine(linesG, tripsRoleID, yourRoleID);
		if (m.yourConcept !== yourConcept) {
		  m.line.addClass('inherited');
		}
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
    switch (side) {
      case 'trips':
        if ('senses' in concept) {
          return sortUniq(concept.senses.map(function(s) { return s.word }));
	} else {
	  return [];
	}
      case 'your':
        return sortUniq(concept.words);
      default:
        throw new Error('WTF');
    }
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
	// oppositeSite=='trips', because we either added them this session and
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

  /* Make sure that all TRIPS concepts that have senses of any of the given
   * words actually have those senses loaded into tripsOnt, and call the done()
   * callback once they do.
   */
  var wordsAlreadyLookedUp = {};
  function lookUpWords(words, done) {
    while (words.length > 0 && wordsAlreadyLookedUp[words[0]]) {
      words.shift();
    }
    if (words.length === 0) {
      done();
    } else {
      var word = words.shift();
      wordsAlreadyLookedUp[word] = true;
      $.ajax({
	url: DSL_DATA_PATH + '../data/' +
	     encodeURIComponent('W::' + word.replace(/\s+/, '_') + '.xml'),
	dataType: 'xml'
      // on success, make sure each TRIPS concept named $name from <CLASS
      // onttype="$name"> has its senses loaded, and then continue looking up
      // this list of words
      }).done(function(data) {
	var classElements = $(data).find('CLASS').toArray();
	// this recursive, nested function is really a forEach loop over
	// classElements, with async parts
	function processNextClassElement() {
	  if (classElements.length === 0) {
	    lookUpWords(words, done);
	  } else {
	    var name = $(classElements.shift()).attr('onttype');
	    ensureSenses(name, processNextClassElement);
	  }
	}
	processNextClassElement();
      // on failure, just continue looking up this list of words
      }).fail(function() {
	lookUpWords(words, done);
      });
    }
  }

  var updateWordCountsTimeoutID;
  var wordLookupCallback;
  function lookupAndUpdateWordCounts(yourConcept) {
    // limit how often we do this, since it's an expensive enough operation
    // that we don't want to do it on each keystroke
    clearTimeout(updateWordCountsTimeoutID);
    updateWordCountsTimeoutID =
      setTimeout(function() {
	// we want to do lookUpWords and then updateWordCounts, but since
	// lookUpWords is async but not reentrant, and we're already calling
	// this asynchronously with setTimeout, we have to be careful to queue
	// up calls to lookUpWords
	function doMyLookup() {
	  wordLookupCallback = function() {
	    updateWordCounts('trips', yourConcept);
	  };
		      // need to pass a copy because lookUpWords shifts out of
		      // its argument
	  lookUpWords([].concat(yourConcept.words), function() {
	    wordLookupCallback();
	    wordLookupCallback = undefined;
	  });
	}
	if (wordLookupCallback === undefined) { // not busy, just do it
	  doMyLookup();
	} else { // lookUpWords is busy, schedule doMyLookup after existing CB
	  var oldWordLookupCallback = wordLookupCallback;
	  wordLookupCallback = function() {
	    oldWordLookupCallback();
	    doMyLookup();
	  };
	}
      }, 200); // milliseconds
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

  window.tripsTreeLoaded = false;
  window.yourTreeLoaded = false;

  var dslToJSON;
  loadXSL('dsl-to-json.xsl', function(dslToJSONarg) {
    dslToJSON = dslToJSONarg;
    $.ajax(DSL_DATA_PATH + 'trips-ont-dsl.xml', { dataType: 'xml' }).
      done(function(tripsOntDSL) {
	window.tripsOnt = xslTransformAndEval(dslToJSON, tripsOntDSL);
	setXSLParameter(dslToJSON, 'senses-only', true);
	for (var name in tripsOnt) { tripsOnt[name].roleMappings = []; }
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
/*  function applyTripsInheritance(concept, semFeatsOut, semFrameOut, inherited) {
    // fill semFeatsOut
    if ('sem_feats' in concept) {
      mergeFeats(semFeatsOut, concept.sem_feats);
    }
    // fill semFrameOut
    if ('sem_frame' in concept) {
      // FIXME this doesn't inherit extra roles, or paths on roles that are inherited where the path is defined
      concept.sem_frame.forEach(function(newRoleRestrMap, roleIndex) {
	var newDynamicRoleRestrMap;
	if ('dynamic_sem_frame' in concept) {
	  newDynamicRoleRestrMap = concept.dynamic_sem_frame[roleIndex];
	}
	var newRoles = newRoleRestrMap.roles.split(' ');
	var oldRoleRestrMap =
	  semFrameOut.find(function(m) {
	    return m.roles.split(' ').includes(newRoles[0]);
	  });
	if ('undefined' === typeof oldRoleRestrMap) {
	  // just deep copy new(Dynamic)RoleRestrMap as a new element of
	  // semFrameOut
	  var roleRestrMap;
	  if (newDynamicRoleRestrMap === undefined) {
	    roleRestrMap = $.extend(true, { paths: [] }, newRoleRestrMap);
	  } else {
	    roleRestrMap = $.extend(true, {}, newDynamicRoleRestrMap);
	    // set each path as inherited (this case can only happen when
	    // inherited)
	    roleRestrMap.paths.forEach(function(p) { p.inherited = true; });
	  }
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
	  // paths
	  // FIXME this should happen more often than the rest, because paths
	  // are editable
	  if (newDynamicRoleRestrMap !== undefined) {
	    newDynamicRoleRestrMap.paths.forEach(function(newPath) {
	      if (!newPath.inherited) {
		// find an old path with the same steps as newPath
		var oldPath =
		  oldRoleRestrMap.paths.find(function(p) {
		    return (newPath.length === p.length &&
			    newPath.every(function(newStep, i) {
			      var oldStep = p[i];
			      return (newStep.role === oldStep.role &&
				      newStep.fillerType == oldStep.fillerType);
			    }));
		  });
		if (oldPath === undefined) {
		  // none found, push a copy of newPath marked as inherited
		  path = [].concat(newPath);
		  path.inherited = true;
		  oldRoleRestrMap.paths.push(path);
		}
	      }
	    });
	  }
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
      applyTripsInheritance(
          tripsOnt[concept.inherit], semFeatsOut, semFrameOut, true);
    }
  }
*/
  /* call applyTripsInheritance if necessary */
/*  function ensureTripsInheritance(concept) {
    if (!('dynamic_sem_frame' in concept)) {
      var sem_feats = {};
      var sem_frame = [];
      applyTripsInheritance(concept, sem_feats, sem_frame);
      concept.dynamic_sem_feats = sem_feats;
      concept.dynamic_sem_frame = sem_frame;
    }
  }
*/
  function applyTripsInheritance(concept, ancestor) {
    var justStarting = (ancestor === undefined);
    // if we're just starting, get rid of any old inherited stuff
    if (justStarting) {
      ancestor = concept;
      concept.roleMappings = (concept.roleMappings || []).filter(function(m) {
	return m.tripsConcept === concept;
      });
      if ('dynamic_sem_frame' in concept) {
	// no need to bother with sem_feats, since it's not editable at all
	concept.dynamic_sem_frame =
	  concept.dynamic_sem_frame.filter(function(roleRestrMap) {
	    return !roleRestrMap.inherited;
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
      // add the ancestor's roleMappings and new roleRestrMaps
      if ('roleMappings' in ancestor) {
        ancestor.roleMappings.forEach(function(am) {
	  if (am.tripsConcept === ancestor && // not inherited
	      // don't already have an overriding mapping
	      concept.roleMappings.every(function(cm) {
		return !(am.tripsRole === cm.tripsRole &&
		         am.tripsRolePath === cm.tripsRolePath &&
			 am.yourConcept === cm.yourConcept);
	      })) {
	    concept.roleMappings.push(am);
	  }
	});
      }
      var ancestor_sem_frame;
      if ('dynamic_sem_frame' in ancestor) {
	ancestor_sem_frame = ancestor.dynamic_sem_frame;
      } else if ('sem_frame' in ancestor) {
	ancestor_sem_frame = ancestor.sem_frame;
      } else {
	ancestor_sem_frame = [];
      }
      ancestor_sem_frame.forEach(function(aRoleRestrMap) {
	if (!aRoleRestrMap.inherited) {
	  var aRoles = aRoleRestrMap.roles.split(' ');
	  var cRoleRestrMap =
	    concept.dynamic_sem_frame.find(function(r) {
	      return r.roles.split(' ').includes(aRoles[0]);
	    });
	  if (cRoleRestrMap === undefined) {
	    cRoleRestrMap = { __proto__: aRoleRestrMap, inherited: true };
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
	  } else {
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
    if (justStarting) {
      // reconstruct paths lists from roleMappings, and fix inherited role
      // references
      concept.dynamic_sem_frame.forEach(function(roleRestrMap) {
	var paths =
	  concept.roleMappings.filter(function(m) {
	    return m.tripsRole.roles === roleRestrMap.roles &&
	           ('tripsRolePath' in m);
	  }).map(function(m) { return m.tripsRolePath })
	// remove dupes
	for (var i = 0; i < paths.length; i++) {
	  for (var j = i + 1; j < paths.length; ) {
	    if (paths[i] === paths[j]) {
	      paths.splice(j, 1);
	    } else {
	      j++;
	    }
	  }
	}
	roleRestrMap.paths = paths;
	// fix inherited role references
	concept.roleMappings.forEach(function(m) {
	  if (m.tripsRole.roles === roleRestrMap.roles) {
	    m.tripsRole = roleRestrMap;
	  }
	});
      });
    }
  }

  /* load words and examples if necessary, and then call done() */
  function ensureSenses(conceptName, done) {
    var concept = tripsOnt[conceptName];
    if ('senses' in concept) {
      done();
    } else {
      $.ajax(DSL_DATA_PATH + encodeURIComponent('ONT::' + conceptName + '.xml'), { dataType: 'xml' }).
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

  function showTripsRoles(concept) {
    applyTripsInheritance(concept);
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
      if (roleRestrMap.added && !roleRestrMap.inherited) {
	li.children('select').first().
	  val(roleRestrMap.roles.replace(/^ont:/,''));
	li.on('rem', remTripsRole);
      } else {
	li.find('select').remove(); // in case added&inherited
	li.prepend(formatRole(roleRestrMap));
      }
      roleRestrMap.paths.forEach(function(path) {
	var pathStr =
	  path.map(function(step) {
	    return ((('role' in step) ? ':' + step.role + ' ' : '') +
		    (('fillerType' in step) ? step.fillerType : ''));
	  }).join(' ');
	var pathLi;
	if (path.inherited) {
	  pathLi = addLiBeforeTemplate(li.children('ul'), '.inherited');
	  pathLi.text(pathStr);
	} else {
	  pathLi = addLiBeforeTemplate(li.children('ul'), '.own');
	  pathLi.children('input').val(pathStr);
	}
	pathLi.attr('id', pathLi.attr('id').replace(/template/, roleIndex));
      });
    });
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
      showTripsRoles(concept);
      $('#trips-details').show();
      updateWordCounts('your', concept);
    } else {
      $('#your-word-counts li').empty();
      $('#trips-details').hide();
    }
    // let things render before updating map
    setTimeout(function() {
      updateMap('trips', 'role', { openClose: true });
    }, 0);
  });

  function applyYourInheritance(concept, ancestor) {
    // if we're just starting, get rid of any old inherited roles/mappings
    if (ancestor === undefined) {
      concept.roles =
        concept.roles.filter(function(r) { return !r.inherited; });
      concept.roleMappings =
        concept.roleMappings.filter(function(m) {
	  return m.yourConcept === concept;
	});
      ancestor = concept;
    } else { // at an ancestor
      // add the ancestor's roleMappings and new roles
      ancestor.roles.forEach(function(role) {
	if ((!role.inherited) && // don't trust ancestor's inherited roles
	    !concept.roles.find(function(r) { return r.name === role.name; })) {
	  concept.roles.push(Object.assign({ inherited: true }, role));
	}
      });
      ancestor.roleMappings.forEach(function(mapping) {
	if (mapping.yourConcept === ancestor && // don't trust inh. mappings
	    !concept.roleMappings.find(function(m) {
	      // TODO? allow inheritance on trips side for this check
	      return (mapping.tripsConcept === m.tripsConcept &&
	              mapping.tripsRole === m.tripsRole &&
		      mapping.tripsRolePath === m.tripsRolePath &&
		      mapping.yourRole.name === m.yourRole.name);
	    })) {
	  concept.roleMappings.push(mapping);
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
    applyYourInheritance(concept);
    var ul = $('#your-roles')[0];
    clearUlUpToTemplate($(ul));
    concept.roles.forEach(function(role) {
      if (role.inherited) {
	var newLi = addLiBeforeTemplate(ul, '.inherited');
	newLi.text(role.name);
      } else {
	var newLi = addLiBeforeTemplate(ul, '.own');
	newLi.on('rem', remYourRole);
	$(newLi.children()[0]).val(role.name);
      }
    });
    setTimeout(function() {
      updateMap('your', 'role', { openClose: true });
    }, 0);
  }

  $('#your-tree').on('changed.jstree', function(evt, args) {
    // selection changed
    if (args.selected.length == 1) {
      var concept = yourOntById[args.selected[0]];
      $('#your-concept-name').val(concept.name);
      $('#your-concept-comment').val(concept.comment);
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
      $('#trips-word-counts li').empty();
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
    return true;
  };

  $(window).resize(function(evt) {
    // update all the things
    updateMap('trips', 'concept', { scroll: true, openClose: true });
    updateMap('trips', 'role',    { scroll: true, openClose: true });
    updateMap('your',  'concept', { scroll: true, openClose: true });
    updateMap('your',  'role',    { scroll: true, openClose: true });
  });

  function tripsConceptSearch(search) {
    console.log('searching trips ontology for concept named ' + search);
    if (search in tripsOnt) {
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

  function yourConceptSearch(search) {
    console.log('searching your ontology for concept named ' + search);
    if (search in yourOntByName) {
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

  $('#rem-concept').on('click', function() {
    var treeNodes = yourJsTree.get_selected(true);
    yourJsTree.delete_node(treeNodes);
    treeNodes.forEach(function(node) {
      var concept = yourOntById[node.id];
      // remove role mappings from their trips concepts, and remove lines
      concept.roleMappings.forEach(function(m) {
	var i = m.tripsConcept.roleMappings.indexOf(m);
	if (i < 0) { throw new Error('WTF'); }
	m.tripsConcept.roleMappings.splice(i, 1);
	if (m.line !== undefined) { m.line.remove(); }
      });
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
	tripsConcept.roleMappings.push(mapping); // so we can remove this mapping if the role itself goes away later
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
	var j = tripsConcept.roleMappings.indexOf(mapping);
	if (j < 0) { throw new Error('WTF'); }
	tripsConcept.roleMappings.splice(j, 1);
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
  });

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
      Object.keys(tripsOnt).forEach(function(name) {
	if (name.length >= lastPrefix.length &&
	    name.substr(0, lastPrefix.length) === lastPrefix) {
	  data.push({
	    label: name,
	    value: butLast + name
	  });
	}
      });
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
      source: autocompleteTripsRolePath
    });
    input.first().focus();
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
      var values = input.value.toLowerCase().trim().split(/[,\s]+/);
      var newPath = [];
      var lastStep = {};
      newPath.push(lastStep);
      values.forEach(function(v) {
	if ('' === v) {
	  throw 'Please enter a TRIPS concept name, a TRIPS role name, or a path of role names with optional concepts, or click the [-] button to remove this field.';
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
	  if (!(fillerType in tripsOnt)) {
	    throw 'Not a trips concept name: ' + fillerType;
	  }
	  lastStep.fillerType = fillerType;
	}
      });
      input.value = values.join(' '); // normalize value
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
    var oldLi =
      remSelectedLi(evt.currentTarget.parentNode.parentNode,
		    function(li) { return li.hasClass('own'); });
    if (oldLi === null) { return; }
    var idFields = oldLi.attr('id').split(/-/); // type-#-of-trips-role-#
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
	rolePath = role.paths.splice(pathIndex, 1);
      }
      // get mappings to be removed, and remove them from TRIPS side
      var mappings = [];
      concept.roleMappings =
	concept.roleMappings.filter(function(m) {
	  if (m.tripsRole === role && m.tripsRolePath === rolePath) {
	    mappings.push(m);
	    return false;
	  } else {
	    return true;
	  }
	});
      // then remove mappings from your side, and remove lines
      mappings.forEach(function(m) {
	var i = m.yourConcept.roleMappings.indexOf(m);
	if (i < 0) { throw new Error('WTF'); }
	m.yourConcept.roleMappings.splice(i, 1);
	if (m.line !== undefined) { m.line.remove(); }
      });
    }
    updateMap('trips', 'role', { openClose: true });
  }

  /* trips roles onchange/rem handlers */

  window.inputTripsRoleName = function(evt) {
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var i = $(evt.currentTarget).parent().index();
    concept.dynamic_sem_frame[i] = {
      roles: 'ont:' + $(evt.currentTarget).val(),
      optional: true,
      added: true,
      paths: []
    };
  };

  function remTripsRole(evt) {
    // 'rem' event from remTripsRolePath can bubble up here, so check that
    // evt.target is really a trips role li before proceeding
    if (!/^trips-role-/.test(evt.target.id)) { return; }
    var id = tripsJsTree.get_selected()[0];
    var concept = tripsOnt[id.replace(/^ont__/,'')];
    var i = $(this).index();
    if (concept.dynamic_sem_frame[i] !== undefined) {
      var role;
      if (concept.dynamic_sem_frame.length == i+1) {
	// can just pop off the role
	role = concept.dynamic_sem_frame.pop();
      } else {
	// adjust IDs of all following lis
	for (var j = i + 1; j < concept.dynamic_sem_frame.length; j++) {
	  $('#trips-role-' +  j   ).attr('id',
	    '#trips-role-' + (j-1));
	  concept.dynamic_sem_frame[j].paths.forEach(function(path, k) {
	    $('#path-' + k + '-of-trips-role-' +  j   ).attr('id',
	       'path-' + k + '-of-trips-role-' + (j-1));
	  });
	}
	// splice out the role
	role = concept.dynamic_sem_frame.splice(i, 1);
      }
      // get mappings to be removed, and remove them from TRIPS side
      var mappings = [];
      concept.roleMappings =
	concept.roleMappings.filter(function(m) {
	  if (m.tripsRole === role) {
	    mappings.push(m);
	    return false;
	  } else {
	    return true;
	  }
	});
      // then remove mappings from your side, and remove lines
      mappings.forEach(function(m) {
	var i = m.yourConcept.roleMappings.indexOf(m);
	if (i < 0) { throw new Error('WTF'); }
	m.yourConcept.roleMappings.splice(i, 1);
	if (m.line !== undefined) { m.line.remove(); }
      });
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
	role = concept.roles.splice(i, 1);
      }
      // get mappings to be removed, and remove them from your side
      var mappings = [];
      concept.roleMappings =
	concept.roleMappings.filter(function(m) {
	  if (m.yourRole === role) {
	    mappings.push(m);
	    return false;
	  } else {
	    return true;
	  }
	});
      // then remove mappings from TRIPS side, and remove lines
      mappings.forEach(function(m) {
	var i = m.tripsConcept.roleMappings.indexOf(m);
	if (i < 0) { throw new Error('WTF'); }
	m.tripsConcept.roleMappings.splice(i, 1);
	if (m.line !== undefined) { m.line.remove(); }
      });
    }
  }

  $('#your-words').on('input', function(evt) {
    var id = yourJsTree.get_selected()[0];
    var concept = yourOntById[id];
    concept.words = $(this).val().trim().replace(/\s+/, ' ').split(/\s*,\s*/);
    lookupAndUpdateWordCounts(concept);
    return true;
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
    if (concept.examples[i] !== undefined) {
      if (concept.examples.length == i+1) {
	concept.examples.pop();
      } else {
	// this really shouldn't happen since examples aren't selectable
	console.log('TODO shift example li IDs');
	concept.examples[i] = undefined;
      }
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
      var roles =
	concept.roles.
	filter(function(r) { return !r.inherited; }).
	map(function(r) {
	  var mappings = [];
	  concept.roleMappings.forEach(function(m) {
	    if (m.yourConcept === concept && m.yourRole === r) {
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
    var allWords = [];
    // reset extra stuff in tripsOnt
    // FIXME doing this here means that if the load fails, the program can be
    // left in an inconsistent state, rather than in the state it was in before
    // the load was attempted
    for (var name in tripsOnt) {
      tripsOnt[name].roleMappings = [];
      delete tripsOnt[name].dynamic_sem_feats;
      delete tripsOnt[name].dynamic_sem_frame;
    }
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
	allWords = allWords.concat(repConcept.words);
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
	      applyTripsInheritance(tripsConcept);
	      var tripsRoleName = m.rolePath[0].role;
	      if (('string' !== typeof tripsRoleName) || !/^ont::/.test(tripsRoleName)) {
		fail('expected role mapping role to be a string starting with ont::');
	      }
	      // FIXME some extra roles that would have been inherited won't be
	      // found here because they're only attached to stuff later in the
	      // file being loaded
	      var tripsRole =
		tripsConcept.dynamic_sem_frame.find(function(roleRestrMap) {
		  return tripsRoleName === roleRestrMap.roles.split(/\s+/)[0];
		});
	      if (tripsRole === undefined) {
		if (isTripsRoleName(tripsRoleName.replace(/^ont::/, ''))) {
		  tripsRole = { roles: tripsRoleName, optional: true, added: true, paths: [] };
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
		      if (!(newStep.fillerType in tripsOnt)) {
			warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a path using a non-existing trips concept ' + newStep.fillerType + '; role mapping deleted');
			continue mapping;
		      }
		    }
		    newPath.push(newStep);
		  }
		}
		//});
		// FIXME some paths that would have been inherited won't be
		// found here because they're only attached to stuff later in
		// the file being loaded
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
	      tripsConcept.roleMappings.push(newMapping);
	    } else {
	      warn('your concept ' + name + "'s role " + r.name + ' has a mapping to a non-existent trips concept ' + tripsName + '; role mapping deleted');
	    }
	  }
	  //});
	});
	yourConcept.conceptMappings = conceptMappings;
	yourConcept.roles = roles;
	yourConcept.roleMappings = roleMappings;
	newOntByName[name] = yourConcept;
	newOntById[yourConcept.id] = yourConcept;
      } catch (e) {
	throw new Error(e.message + ' in ' + name + ': ' + JSON.stringify(repConcept)/* + "\n" + e.stack*/);
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
      // look up all words used in your concepts
      allWords = sortUniq(allWords);
      lookUpWords(allWords, function() {
	// when that's done, update the map UI
        updateMap('your', 'concept', { openClose: true });
      });
      // FIXME there is a danger that the user will do something that calls
      // lookUpWords before the above call finishes, but hopefully they will
      // wait until they see the map UI update before doing anything
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
      } finally {
	// reset the file input so that we get a change event again even if
	// we're loading from the same filename
	// NOTE: $('#file-input').val('') doesn't work for security reasons
	$('#file-input-form')[0].reset();
      }
    };
    reader.readAsText(file);
  });

  $('#trips-details').hide();
  $('#your-details').hide();
});
