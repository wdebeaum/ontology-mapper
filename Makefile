JQUERY_VERSION=3.1.1
JSTREE_VERSION=3.3.2
download=curl -O -L $(1)

all: libs

LIBS=jquery.min.js jstree.min.js style.min.css

libs: $(LIBS)

jquery.min.js:
	$(call download,https://code.jquery.com/jquery-$(JQUERY_VERSION).min.js)
	mv jquery-$(JQUERY_VERSION).min.js jquery.min.js

jstree.min.js:
	$(call download,https://cdnjs.cloudflare.com/ajax/libs/jstree/$(JSTREE_VERSION)/jstree.min.js)

style.min.css:
	$(call download,https://cdnjs.cloudflare.com/ajax/libs/jstree/$(JSTREE_VERSION)/themes/default/style.min.css)

clean:
	rm -f $(LIBS)

