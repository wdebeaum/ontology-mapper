INSTALL_DIR=/u/www/research/trips/lexicon/ontology-mapper
DSL_DATA_PATH=../dsl/
JQUERY_VERSION=3.1.1
JSTREE_VERSION=3.3.2
download=curl -O -L $(1)

DOWNLOADS = \
	jquery.min.js \
	jstree.min.js \
	style.min.css \
	32px.png \
	40px.png \
	throbber.gif \
	str.replace.template.xsl
SRCS = \
	$(DOWNLOADS) \
	ontology-mapper.html \
	ontology-mapper.css \
	ontology-mapper.js \
	dsl-to-json.xsl

all: download

install: $(SRCS)
	mkdir -p $(INSTALL_DIR)
	cp $(SRCS) $(INSTALL_DIR)/
	sed -e "s@var DSL_DATA_PATH = 'dsl/'@var DSL_DATA_PATH = '$(DSL_DATA_PATH)'@" <ontology-mapper.js >$(INSTALL_DIR)/ontology-mapper.js

download: $(DOWNLOADS)

jquery.min.js:
	$(call download,https://code.jquery.com/jquery-$(JQUERY_VERSION).min.js)
	mv jquery-$(JQUERY_VERSION).min.js jquery.min.js

jstree.min.js:
	$(call download,https://cdnjs.cloudflare.com/ajax/libs/jstree/$(JSTREE_VERSION)/$@)

style.min.css 32px.png 40px.png throbber.gif:
	$(call download,https://cdnjs.cloudflare.com/ajax/libs/jstree/$(JSTREE_VERSION)/themes/default/$@)

str.replace.template.xsl:
	$(call download,http://exslt.org/str/functions/replace/str.replace.template.xsl)

clean:
	rm -f $(DOWNLOADS)

