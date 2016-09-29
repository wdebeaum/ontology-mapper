$(function() {
  var jsTreeConfig = {
    core: {
      animation: false,
      themes: {
	icons: false,
	stripes: true
      },
    }
  };
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
  $('#trips-tree').jstree(
    $.extend(true, { core: { data: tree } }, jsTreeConfig)
  );
  $('#your-tree').jstree(
    $.extend(true, {
      core: {
	data: tree,
	check_callback: true
      },
      plugins: ['dnd']
    }, jsTreeConfig)
  );
});
