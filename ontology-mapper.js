$(function() {
  var jsTreeConfig = {
    core: {
      animation: false,
      themes: {
	icons: false,
	stripes: true
      },
      check_callback: true
    },
    plugins: ['dnd']
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
  jsTreeConfig.core.data = tree
  $('#trips-tree').jstree(jsTreeConfig);
  $('#your-tree').jstree(jsTreeConfig);
});
