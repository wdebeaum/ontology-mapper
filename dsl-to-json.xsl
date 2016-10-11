<?xml version="1.0" encoding="UTF-8"?>
<stylesheet version="1.0"
  xmlns:exsl="http://exslt.org/common"
  xmlns:str="http://exslt.org/strings"
  extension-element-prefixes="str exsl"
  xmlns="http://www.w3.org/1999/XSL/Transform">

<!--
dsl-to-json.xsl - convert trips-ont-dsl.xml to JSON on the way to jsTree
(or dsl/ONT::*.xml to JSON)
Note: this is not meant to be a general transformation, it only works for these
files in this situation.
  -->

<!-- doesn't work on Safari :( -->
<!-- import href="str.replace.template.xsl" / -->

<output method="text" encoding="UTF-8" />

<param name="senses-only" select="false()" />

<template match="text()|@*" />

<template name="escape">
 <param name="str" />
 <!-- TODO? control chars \b \f \n \r \t -->
 <!-- call-template name="str:replace">
  <with-param name="search" select="'&quot;'" />
  <with-param name="replace" select="'\&quot;'" />
  <with-param name="string">
   <call-template name="str:replace">
    <with-param name="search" select="'\'" />
    <with-param name="replace" select="'\\'" />
    <with-param name="string" select="$str" />
   </call-template>
  </with-param>
 </call-template -->
 <!-- we don't actually escape anything, so maybe this isn't necessary -->
 <value-of select="$str" />
</template>

<template match="relation[@label='inherit']">
 <text>    inherit: '</text>
 <!-- FIXME sometimes we get both the parent ONT type and the feature list type in the inherit relation. This just gets the first one. -->
 <variable name="norm" select="normalize-space(.)" />
 <variable name="v">
  <choose>
   <when test="contains($norm, ' ')">
    <value-of select="substring-before($norm, ' ')" />
   </when>
   <otherwise>
    <value-of select="$norm" />
   </otherwise>
  </choose>
 </variable>
 <choose>
  <when test="starts-with($v, 'ont::')">
   <value-of select="substring($v, 6)" />
  </when>
  <otherwise>
   <value-of select="$v" />
  </otherwise>
 </choose>
 <text>',
</text>
</template>

<!-- FIXME see above -->
<template match="or[parent::concept/parent::dsl]" />

<template match="or">
 <if test="parent::role-restr-map">
  <text>          sem_feats: {
        </text>
 </if>
 <text>    inherit: '</text>
 <for-each select="concept/@name">
  <if test="position() != 1">
   <text> or </text>
  </if>
  <value-of select="." />
 </for-each>
 <text>'</text>
 <if test="parent::role-restr-map">
  <text>
          }</text>
 </if>
 <text>,
</text>
</template>

<template match="relation[@label='overlap']">
 <!-- text>    overlap: [</text>
 <call-template name="str:replace">
  <with-param name="string">
   <call-template name="str:replace">
    <with-param name="string">
     <call-template name="str:replace">
      <with-param name="string" select="normalize-space(.)" />
      <with-param name="search" select="'wn::|'" />
      <with-param name="replace" select="'&quot;'" />
     </call-template>
    </with-param>
    <with-param name="search" select="'|'" />
    <with-param name="replace" select="'&quot;'" />
   </call-template>
  </with-param>
  <with-param name="search" select="' '" />
  <with-param name="replace" select="','" />
 </call-template>
 <text>],
</text -->
 <!-- HACK: not really JSON, but because we're using eval we can cheat and call JS functions to do our dirty work -->
 <text>    overlap: "</text>
 <value-of select="normalize-space(.)" />
 <text>".replace(/(wn::)?\|/g, '').split(/\s+/),
</text>
</template>

<template match="feat">
 <text>        '</text>
 <value-of select="@name" />
 <text>': '</text>
 <choose>
  <when test="or">
   <!-- call-template name="str:replace">
    <with-param name="string" select="normalize-space(.)" />
    <with-param name="search" select="' '" />
    <with-param name="replace" select="' or '" />
   </call-template -->
   <!-- HACK: see above -->
   <value-of select="normalize-space(.)" />
   <text>'.replace(/\s+/, ' or ') + '</text>
  </when>
  <otherwise>
   <value-of select="." />
  </otherwise>
 </choose>
 <text>',
</text>
</template>

<template match="sem-feats">
 <text>    sem_feats: {
  </text>
 <apply-templates select="relation | or" />
 <text>      features: {
</text>
 <apply-templates select="feat" />
 <text>      }
    },
</text>
</template>

<template match="role-restr-map">
 <text>      { roles: '</text>
 <value-of select="@roles" />
 <text>'</text>
 <if test="@optional">
  <text>, optional: true</text>
 </if>
 <choose>
  <when test="concept[@name!='t'] | or | sem-feats">
   <text>, restriction: {
</text>
    <apply-templates />
   <text>        }
      </text>
  </when>
  <otherwise>
   <text> </text>
  </otherwise>
 </choose>
 <text>},
</text>
</template>

<template match="sem-frame">
 <text>    sem_frame: [
</text>
 <apply-templates />
 <text>    ],
</text>
</template>

<template match="comment">
 <text>    comment: </text>
 <variable name="v" select="normalize-space(.)" />
 <choose>
  <when test="starts-with($v, '&quot;')">
   <value-of select="$v" />
  </when>
  <otherwise>
   <text>'</text><value-of select="$v" /><text>'</text>
  </otherwise>
 </choose>
 <text>,
</text>
</template>

<template match="concept">
 <if test="parent::role-restr-map">
  <text>          sem_feats: {
  </text>
 </if>
 <text>          inherit: '</text>
 <value-of select="@name" />
 <text>'</text>
 <if test="parent::role-restr-map">
  <text>
          }</text>
 </if>
 <text>,
</text>
</template> 

<template match="concept[parent::dsl]">
 <variable name="name" select="substring(@name, 6)" />
 <text>  '</text>
 <value-of select="$name" />
 <text>': { name: '</text>
 <value-of select="$name" />
 <text>',
</text>
 <apply-templates />
 <text>  },
</text>
</template>

<template match="sense">
 <text>  {</text>
 <for-each select="morph"><!-- don't expect more than one, but just in case -->
  <text> pos: '</text>
  <value-of select="pos/@pos" />
  <text>', word: '</text>
  <value-of select="word/@first-word" />
  <if test="word/@remaining-words">
   <text> </text>
   <value-of select="word/@remaining-words" />
  </if>
  <if test="word/@particle">
   <text> (</text>
   <value-of select="word/@particle" />
   <text>)</text>
  </if>
  <text>', </text>
 </for-each>
 <if test="example">
  <text>examples: [</text>
  <for-each select="example">
   <if test="position() != 1"><text>, </text></if>
   <text>"</text>
   <call-template name="escape">
    <with-param name="str" select="@text" />
   </call-template>
   <text>"</text>
  </for-each>
  <text>] </text>
 </if>
 <text>},
</text>
</template>

<template match="/dsl">
 <choose>
  <when test="$senses-only">
   <text>[
</text>
   <apply-templates select="sense" />
   <text>]</text>
  </when>
  <otherwise>
   <text>{
</text>
   <apply-templates select="concept" />
   <text>}</text>
  </otherwise>
 </choose>
</template>

</stylesheet>
