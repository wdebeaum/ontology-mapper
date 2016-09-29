JQUERY_VERSION=3.1.1
JSTREE_VERSION=3.3.2
download=curl -O -L $(1)

all: download

DOWNLOADS = \
	jquery.min.js \
	jstree.min.js \
	style.min.css \
	32px.png \
	40px.png \
	throbber.gif

download: $(DOWNLOADS)

jquery.min.js:
	$(call download,https://code.jquery.com/jquery-$(JQUERY_VERSION).min.js)
	mv jquery-$(JQUERY_VERSION).min.js jquery.min.js

jstree.min.js:
	$(call download,https://cdnjs.cloudflare.com/ajax/libs/jstree/$(JSTREE_VERSION)/$@)

style.min.css 32px.png 40px.png throbber.gif:
	$(call download,https://cdnjs.cloudflare.com/ajax/libs/jstree/$(JSTREE_VERSION)/themes/default/$@)

clean:
	rm -f $(DOWNLOADS)

