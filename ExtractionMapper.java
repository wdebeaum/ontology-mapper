import java.io.InputStreamReader;
import java.io.IOException;
import java.util.Map;
// These are from json-simple: https://github.com/fangyidong/json-simple
// also available in cabot and bob as
// $TRIPS_BASE/src/Conceptualizer/json-simple-1.1.1.jar
import org.json.simple.parser.JSONParser;
import org.json.simple.parser.ParseException;
import org.json.simple.JSONObject;
import org.json.simple.JSONArray;

import java.util.ArrayList;

import java.util.HashMap;


/** Read a file saved from the Ontology Mapper/Builder in JSON format from
 * stdin, and generate extraction rules, output to stdout
 *
 * Compile:
 * export TRIPS_BASE=/path/to/a/cabot/or/bob/checkout
 * javac \
 *   -cp .:$TRIPS_BASE/src/Conceptualizer/json-simple-1.1.1.jar \
 *   ExtractionMapper.java
 *
 * Run:
 * java \
 *   -cp .:$TRIPS_BASE/src/Conceptualizer/json-simple-1.1.1.jar \
 *   ExtractionMapper \
 *   &lt; input.json \
 *   &gt; output.txt
 *
 * (javadoc doesn't like raw less-than and greater-than signs, so they're
 * escaped above)
 */

/*
 javac -cp .:/Users/cmteng/tripsSystems/TRIPS/Conceptualizer/json-simple-1.1.1.jar ExtractionMapper.java
 java -cp .:/Users/cmteng/tripsSystems/TRIPS/Conceptualizer/json-simple-1.1.1.jar ExtractionMapper < activate.json
 */

public class ExtractionMapper {
    private static String newPackageName = "TMP";
    private static String newRuleSet = newPackageName + "RuleSet";
    
    private static int maxNumRoles = 10;  // at most 10 role mappings
    private static int maxNumInRolePath = 10;  // at most 10 role linkings

    private static int maxNumSMOne = 10;  // at most 10 mappings for one symbol

    private static ArrayList<String> mentionedRoles = new ArrayList<String>();
    
    private static class SMOne {
        String symbolmapTo;
        String symbolmapRule; // the symbolmap only applies to this rule
        int nFrom;
        String[] symbolmapFrom = new String[maxNumSMOne];
    }
    
    private static class RoleMap {
        String toRole;
        String toRoleType;
        String optional = "!";  // if not optional, this is set to "!"
        int nFromRoles;
        String[] fromRoles = new String[maxNumInRolePath];
        String[] fromRestrictions = new String[maxNumInRolePath];
    }
    
    private static class RuleParams {
        String sourceTypes;
        String targetType;
        int nRoleMaps;
        RoleMap[] roleMaps = new RoleMap[maxNumRoles];
    }

    private static String safeString(String s)
    {
        if (s.matches("[a-zA-Z0-9_\\-:]*"))
        {
            return (s);
        }
        else
        {
            System.err.println(s + " contains unallowed characters (we allow only [a-zA-Z0-9_-:])");
            System.exit(1);
        }
        return ("");
    }
    
    public static void main(String[] args) {
        JSONParser parser = new JSONParser();
        // parse takes a Reader as its argument, so wrap System.in
        InputStreamReader in = new InputStreamReader(System.in);

        ArrayList<RuleParams> rList = new ArrayList<RuleParams>();
        ArrayList<SMOne> symbolmap = new ArrayList<SMOne>();
        
        /*
        RuleParams oneRule = new RuleParams();
        oneRule.sourceType = "ABC";
        rList.add(oneRule);
        System.out.println(rList.get(0).sourceType);
        */
        
        int ruleCounter = 0;
        int symbolmapCounter = 0;
        
        try {
            // parse returns Object, but we know it's a JSONObject for this input
            JSONObject targetConcepts = (JSONObject)parser.parse(in);
            // JSONObject is just a special HashMap<String, Object>, except it just
            // uses HashMap without specifying the key type :(
            
            // ------------  premble  ---------------
            System.out.printf("(in-package \"IM\")\n");

            String ontPrefix = safeString((String) targetConcepts.get("ontologyPrefix"));
            if (!ontPrefix.equals(""))
            {
                newPackageName = ontPrefix;
                newRuleSet = newPackageName + "RuleSet";
            }
 
            System.out.printf("(defpackage :%s)\n", newPackageName);

            System.out.printf("\n(reset-im-rules '%s)\n", newRuleSet);
            System.out.printf("(mapcar #'(lambda (x) (add-im-rule x '%s))\n", newRuleSet);
            System.out.printf("'(\n\n");
            
            for (Object entryObject : targetConcepts.entrySet())
            {
                Map.Entry entry = (Map.Entry)entryObject;
                String key = safeString((String)entry.getKey());
                // you probably want to ignore this one, since it's the only key that's
                // not a concept name
                if (key.equals("ontologySaveDate") || key.equals("ontologyPrefix")) { continue; }
                //System.out.println(key); // your concept name                             // activate
                
                // =============================================================
                // -------------------------  rule defintions
                // =============================================================

                JSONObject keyMap = (JSONObject)entry.getValue();
                // parent is optional; top-level concepts have no parent
                if (keyMap.containsKey("parent")) {
                    String parent = safeString((String)keyMap.get("parent"));
                    //System.out.println(parent);
                }
                
                
                SMOne oneSM = new SMOne();
                boolean isSymbol = (boolean)keyMap.get("isSymbol");
                if (isSymbol)
                {
                    oneSM.symbolmapTo = key;
                    oneSM.nFrom = 0;
                }
                
                Map<String, Boolean> filledBySymbolMap = new HashMap<String, Boolean>();
                
                JSONArray roles = (JSONArray)keyMap.get("roles");
                for (Object rolesObj : roles)
                {
                    JSONObject r = (JSONObject) rolesObj;
                    String rName = safeString((String)r.get("name"));
                    filledBySymbolMap.put(rName , false);
                    if (r.containsKey("filledBySymbol"))
                    {
                        if ((boolean)r.get("filledBySymbol") == true)  //currently false is not recorded, but just in case...
                            filledBySymbolMap.put(rName , true);
                    }
                    //System.out.println("filledBySymbolMap: " + rName + "; " + filledBySymbolMap.get(rName) + "\n");
                }
                

                JSONArray mappings = (JSONArray)keyMap.get("mappings");
                for (Object mappingObj : mappings)
                {
                    JSONObject mapping = (JSONObject)mappingObj;
                    
                    // ----------  initialization  -----------
                    int roleCounter = 0;
                    RuleParams oneRule = new RuleParams();
                    for (int i=0; i<maxNumRoles; i++)
                    {
                        oneRule.roleMaps[i] = new RoleMap();
                    }
                    
                    // ------------  start processing  ----------------
                    JSONArray concepts = (JSONArray)mapping.get("concepts");
                    String conceptsStr = "";
                    if (isSymbol)
                    {
                        for (Object conceptObj : concepts)                                  // ont::start ont::start-object
                        {
                            oneSM.symbolmapFrom[oneSM.nFrom] = safeString((String)conceptObj);
                            oneSM.nFrom++;
                        }
                    }

                    else
                    {
                        for (Object conceptObj : concepts)                                  // ont::start ont::start-object
                        {
                            conceptsStr = conceptsStr + " " + safeString((String)conceptObj);
                        }
                        //System.out.println(conceptsStr);
                        
                        oneRule.targetType = key;                                           // activate
                        oneRule.sourceTypes = conceptsStr;
                        
                        //int roleID = -1;
                        
                        JSONArray rolePathMappings = (JSONArray)mapping.get("rolePathMappings");
                        for (Object rolePathMappingObj : rolePathMappings)
                        {
                            JSONArray rolePathMapping = (JSONArray)rolePathMappingObj;
                            int rolePathCounter = 0;
                            
                            for (int i=0; i<rolePathMapping.size(); i++)
                            {
                                Object rp = rolePathMapping.get(i);
                                if (rp instanceof JSONObject)
                                {
                                    JSONObject rolePath = (JSONObject)rp;
                                    
                                    /*  ------  abandoned code
                                    int fromRoleID = (int) safeString((String)rolePath.get("roleID"));  // e.g., 5
                                    if (roleID == -1)
                                    {
                                        if (oneRule.roleMaps[roleCounter].optional.equals(""))
                                        {
                                            roleID = fromRoleID;
                                        }
                                        else
                                        {
                                        }
                                    }
                                    else
                                    {
                                        if (!oneRule.roleMaps[roleCounter].optional.equals(""))
                                        {
                                            roleID = -1;
                                        }
                                    }
                                     */
                                    
                                    String fromRoleName = safeString((String)rolePath.get("role"));
                                    oneRule.roleMaps[roleCounter].fromRoles[rolePathCounter] =
                                    fromRoleName.substring(4, fromRoleName.length());              // :agent (omit "ont:")
                                    //System.out.println(oneRule.roleMaps[roleCounter].fromRoles[rolePathCounter]);
                                    
                                    // fillerType is optional
                                    if (rolePath.containsKey("fillerType"))
                                    {
                                        String fillerType = safeString((String)rolePath.get("fillerType"));           // ont::molecular-part
                                        //oneRule.roleMaps[roleCounter].fromRestrictions = fillerType;
                                        oneRule.roleMaps[roleCounter].fromRestrictions[rolePathCounter] = fillerType;
                                        //System.out.println(fillerType);
                                    }
                                    rolePathCounter++;
                                    
                                }
                                else
                                {
                                    String rpString = safeString((String) rp);
                                    if (rpString.equals("optional"))   //  (also always at i=0)
                                    {
                                        oneRule.roleMaps[roleCounter].optional = "";
                                    }
                                    else
                                    {
                                        oneRule.roleMaps[roleCounter].toRole = rpString;        // arg0
                                        //System.out.println(rp);
                                        if (i < rolePathMapping.size()-1) // if there is a type0 (target filler type)
                                        {
                                            oneRule.roleMaps[roleCounter].toRoleType = safeString((String)rolePathMapping.get(i+1));        // type0
                                            //System.out.println(oneRule.roleMaps[roleCounter].toRoleType);
                                            
                                            // add type0 this to symbolmap, so as to get around *optional* mapping to a constant (e.g., ONT::GOLD -> TMP::newcolor1)
                                            SMOne oneSM_2 = new SMOne();
                                            oneSM_2.symbolmapTo = safeString((String)rolePathMapping.get(i+1));
                                            oneSM_2.nFrom = 0;
                                            oneSM_2.symbolmapFrom[oneSM.nFrom] = oneRule.roleMaps[roleCounter].fromRestrictions[rolePathCounter-1];
                                            oneSM_2.symbolmapRule = "-rule" + ruleCounter + ">";
                                            oneSM_2.nFrom++;
                                            symbolmap.add(oneSM_2);
                                        }
                                        break;
                                    }
                                    
                                }
                            }
                            oneRule.roleMaps[roleCounter].nFromRoles = rolePathCounter;
                            //System.out.println("rolePathCounter: " + rolePathCounter);
                            
                            roleCounter++;
                            
                        }
                        
                        oneRule.nRoleMaps = roleCounter;
                        //System.out.println("roleCounter: " + roleCounter);
                        
                        // =============================================================
                        // ----------------  generate the extraction rule
                        // =============================================================
                        rList.add(oneRule);
                        
                        System.out.printf("((?spec ?!ev (? t %s)", oneRule.sourceTypes);
                        
                        String assoc_withs = "";
                        String mods = "";
                        
                        for (int i=0; i<roleCounter; i++)
                        {
                            if ((oneRule.roleMaps[i].fromRestrictions[0] != null) && (oneRule.roleMaps[i].fromRestrictions[0].equals("nil")))
                            {
                                System.out.printf(" %s -", oneRule.roleMaps[i].fromRoles[0]);  // the first in the rolePath
                                
                            }
                            else if (oneRule.roleMaps[i].fromRoles[0].equals(":assoc-with"))
                            {
                                assoc_withs = String.format("%s ?%sa%d_0", assoc_withs, oneRule.roleMaps[i].optional, i);
                            }
                            else if (oneRule.roleMaps[i].fromRoles[0].equals(":mod"))
                            {
                                mods = String.format("%s ?%sa%d_0", mods, oneRule.roleMaps[i].optional, i);
                            }
                            else
                            {
                                System.out.printf(" %s ?%sa%d_0", oneRule.roleMaps[i].fromRoles[0], oneRule.roleMaps[i].optional, i);  // the first in the rolePath
                            }
                        }
                        
                        if (!assoc_withs.equals(""))
                        {
                            System.out.printf(" :assoc_withs (%s)", assoc_withs);
                        }
                        if (!mods.equals(""))
                        {
                            System.out.printf(" :mods (%s)", mods);
                        }
                        
                        System.out.printf(" :sequence -)\n");
                        
                        for (int i=0; i<roleCounter; i++)  {
                            if ((oneRule.roleMaps[i].fromRestrictions[0] != null) && (oneRule.roleMaps[i].fromRestrictions[0].equals("nil")))
                            {
                                continue;
                            }
                            
                            //System.out.println("nFromRoles: " + oneRule.roleMaps[i].nFromRoles + "\n");
                            for (int j=0; j<oneRule.roleMaps[i].nFromRoles; j++)
                            {
                                if (oneRule.roleMaps[i].fromRestrictions[j] != null)
                                {
                                    if (oneRule.roleMaps[i].fromRoles[j+1] != null)
                                    {
                                        System.out.printf("  (?spec%d_%d ?%sa%d_%d (? t%d_%d %s) %s ?%sa%d_%d)\n", i, j, oneRule.roleMaps[i].optional, i, j, i, j, oneRule.roleMaps[i].fromRestrictions[j], oneRule.roleMaps[i].fromRoles[j+1], oneRule.roleMaps[i].optional, i, j+1);
                                    }
                                    else
                                    {
                                        System.out.printf("  (?spec%d_%d ?%sa%d_%d (? t%d_%d %s))\n", i, j, oneRule.roleMaps[i].optional, i, j, i, j, oneRule.roleMaps[i].fromRestrictions[j]);
                                    }
                                }
                                else
                                {
                                    //put in a dummy constraint matching everything when there is no restriction on an argument, so that we can use the type in symbolmapping if needed
                                    System.out.printf("  (?spec%d_%d ?%sa%d_%d ?t%d_%d)\n", i, j, oneRule.roleMaps[i].optional, i, j, i, j);
                                }
                            }
                            
                            //System.out.println("filledBySymbolMap: " + "color" + "; " + filledBySymbolMap.get("color") + "\n");
                            //System.out.println("filledBySymbolMap: " + oneRule.roleMaps[i].toRole + "; " + filledBySymbolMap.get(oneRule.roleMaps[i].toRole) + "\n");
                            if (oneRule.roleMaps[i].toRole != null)
                            {
                                if (filledBySymbolMap.get(oneRule.roleMaps[i].toRole))
                                {
                                    System.out.printf("  (ONT::EVAL (symbolmap ?t%d_%d ?!t%d_%db))\n", i, oneRule.roleMaps[i].nFromRoles-1, i, oneRule.roleMaps[i].nFromRoles-1);
                                }
                                else  // do symbolmap regardless, so as to get around *optional* mapping to a constant (e.g., ONT::GOLD -> TMP::newcolor1)
                                {
                                    System.out.printf("  (ONT::EVAL (symbolmap ?t%d_%d ?!t%d_%db -rule%d>))\n", i, oneRule.roleMaps[i].nFromRoles-1, i, oneRule.roleMaps[i].nFromRoles-1, ruleCounter);
                                }
                            }
                           
                        }
                        
                        
                        System.out.printf("-rule%d>\n", ruleCounter);
                        // skip rule priority
                        
                        //System.out.printf("(ONT::EVENT ?!ev %s::%s\n", newPackageName, oneRule.targetType);
                        System.out.printf("(?spec ?!ev %s::%s\n", newPackageName, oneRule.targetType);

                        for (int i=0; i<roleCounter; i++)  {
                            if (oneRule.roleMaps[i].toRole != null)
                            {
                                if (oneRule.roleMaps[i].toRoleType == null)
                                {
                                    if (filledBySymbolMap.get(oneRule.roleMaps[i].toRole))
                                    {
                                        System.out.printf("  :%s ?!t%d_%db\n", oneRule.roleMaps[i].toRole, i, oneRule.roleMaps[i].nFromRoles-1);
                                    }
                                    else
                                    {
                                        System.out.printf("  :%s ?%sa%d_%d\n", oneRule.roleMaps[i].toRole, oneRule.roleMaps[i].optional, i, oneRule.roleMaps[i].nFromRoles-1);
                                    }
                                }
                                else
                                {
                                    //System.out.printf("  :%s %s::%s\n", oneRule.roleMaps[i].toRole, newPackageName, oneRule.roleMaps[i].toRoleType);
                                    System.out.printf("  :%s ?!t%d_%db\n", oneRule.roleMaps[i].toRole, i, oneRule.roleMaps[i].nFromRoles-1);  // do symbolmap regardless, so as to get around *optional* mapping to a constant (e.g., ONT::GOLD -> TMP::newcolor1)
                                }
                                if (!mentionedRoles.contains(oneRule.roleMaps[i].toRole))  {  // for *roles-to-emit*
                                    mentionedRoles.add(oneRule.roleMaps[i].toRole);
                                }
                                
                            }
                        }

                        System.out.printf("  :rule -rule%d>\n", ruleCounter);

                        System.out.printf("))\n");
                        System.out.printf("\n");
                        
                        
                        /*
                         System.out.println(ruleCounter);
                         System.out.println(oneRule.sourceType);
                         System.out.println(oneRule.targetType);
                         for (int i=0; i<10; i++)  {
                         System.out.println(oneRule.roleMaps[i].fromRole);
                         System.out.println(oneRule.roleMaps[i].toRole);
                         System.out.println(oneRule.roleMaps[i].fromRestrictions);
                         }
                         */
                        
                        
                        
                        ruleCounter++;
                        //System.out.println("ruleCounter: " + ruleCounter);
                    }
                }
            
                symbolmap.add(oneSM);
    
                // ignoring keys "comment", "words", "examples", since I'm guessing you're not so interested in those
            }
            
            /*
            System.out.println(rList.get(0).sourceType);
            System.out.println(rList.get(1).sourceType);
             */
            
        } catch (IOException e) {
            System.err.println("Error reading stdin: " + e);
        } catch (ParseException e) {
            System.err.println("Error parsing JSON: " + e);
        } catch (ClassCastException e) {
            System.err.println("Error interpreting JSON: " + e);
        }

        System.out.printf(")\n)\n\n");

        // ------------  extraction settings  ---------------
        //System.out.printf("(setq *extractor-oblig-features* '(:rule))\n");
        System.out.printf("(setq *roles-to-emit* (remove-duplicates (union *roles-to-emit* '(\n");  //take union because there could be several rules files, each with a *roles-to-emit*
        System.out.printf("   :rule\n");
        for (int i=0; i<mentionedRoles.size(); i++)  {
            System.out.printf("   :%s\n", mentionedRoles.get(i));
        }
        System.out.printf("))))\n");
        System.out.printf("\n");
        
        System.out.printf("(setq *symbol-map* (sort-symbol-map (remove-duplicates (union *symbol-map* '(\n");
        for (int i=0; i<symbolmap.size(); i++)
        {
            for (int j=0; j<symbolmap.get(i).nFrom; j++)
            {
                System.out.printf("   (%s %s::%s", symbolmap.get(i).symbolmapFrom[j], newPackageName, symbolmap.get(i).symbolmapTo);
                if (symbolmap.get(i).symbolmapRule != null)
                {
                    System.out.printf(" %s", symbolmap.get(i).symbolmapRule);
                }
                System.out.printf(")\n");
            }
        }
        System.out.printf(")) :test #'equal)))\n");
        
    
    }
}
