<?xml version="1.0" encoding="UTF-8"?>
<stylesheet version="1.0"
  xmlns:exsl="http://exslt.org/common"
  xmlns:str="http://exslt.org/strings"
  extension-element-prefixes="str exsl"
  xmlns="http://www.w3.org/1999/XSL/Transform">

<!--
dsl-to-json.xsl - convert trips-ont-dsl.xml to JSON on the way to jsTree
  -->

<import href="str.replace.template.xsl" />

<output method="text" encoding="UTF-8" />

<template match="text()|@*" />

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
 <text>    inherit: '</text>
 <for-each select="concept/@name">
  <if test="position() != 1">
   <text> or </text>
  </if>
  <value-of select="." />
 </for-each>
 <text>',
</text>
</template>

<template match="relation[@label='overlap']">
 <text>    overlap: [</text>
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
</text>
</template>

<template match="feat">
 <text>        '</text>
 <value-of select="@name" />
 <text>': '</text>
 <choose>
  <when test="or">
   <call-template name="str:replace">
    <with-param name="string" select="normalize-space(.)" />
    <with-param name="search" select="' '" />
    <with-param name="replace" select="' or '" />
   </call-template>
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
 <text>          inherit: '</text>
 <value-of select="@name" />
 <text>',
</text>
</template> 

<template match="concept[parent::dsl]">
 <text>  '</text>
 <value-of select="substring(@name, 6)" />
 <text>': {
</text>
 <apply-templates />
 <text>  },
</text>
</template>

<template match="/dsl">
 <text>{
</text>
 <apply-templates select="concept" />
 <text>}</text>
</template>

</stylesheet>
