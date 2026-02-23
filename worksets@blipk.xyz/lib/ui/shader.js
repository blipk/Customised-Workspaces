import GObject from "gi://GObject"
import Clutter from "gi://Clutter"

import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"


// Internal imports
import * as dev from "../../dev.js"

// Shader example
const OUTLINE_SHADER_SOURCE = `uniform sampler2D tex;
    uniform vec4 v_color = vec4(0, 0, 0, 255);
    const vec4 u_outlineColor = vec4(255, 255, 255, 250);
    const float smoothing = 1.0/16.0;
    const float outlineWidth = 3.0/16.0;
    const float outerEdgeCenter = 0.5 - outlineWidth;

    void main() {
        float distance = texture2D(tex, cogl_tex_coord_in[0].xy).a;
        float alpha = smoothstep(outerEdgeCenter - smoothing, outerEdgeCenter + smoothing, distance);
        float border = smoothstep(0.5 - smoothing, 0.5 + smoothing, distance);
        gl_FragColor = vec4( mix(u_outlineColor.rgb, v_color.rgb, border), alpha );
    }`

export var TextOutlineEffect = GObject.registerClass( {
    GTypeName: "TextOutlineEffect"
}, class TextOutlineEffect extends Clutter.ShaderEffect {
    vfunc_get_static_shader_source() {
        return OUTLINE_SHADER_SOURCE
    }

    vfunc_paint_target( paint_context ) {
        try {
            //this.set_uniform_value("u_texture", 0);
            //this.set_uniform_value('FontColor', 255255255);
            //this.set_uniform_value('OutlineColor', 255);
            super.vfunc_paint_target( paint_context )
        } catch ( e ) { dev.log( e ) }
    }
} )
